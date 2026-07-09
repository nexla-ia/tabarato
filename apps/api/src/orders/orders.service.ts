import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { OrderStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CouponsService } from '../coupons/coupons.service'
import { PushService } from '../common/push.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PaymentsService } from '../payments/payments.service'
import { MpOauthService } from '../payments/mp-oauth.service'
import { DeliveryMatchingService } from '../couriers/delivery-matching.service'
import { CreateOrderDto } from './dto/create-order.dto'

function isStoreOpenNow(openingHours: any, scheduleExceptions?: any): boolean | null {
  const localMs = Date.now() - 4 * 60 * 60 * 1000
  const local   = new Date(localMs)
  const today   = local.toISOString().slice(0, 10) // YYYY-MM-DD

  // Check holiday/exception overrides first
  if (Array.isArray(scheduleExceptions)) {
    const ex = scheduleExceptions.find((e: any) => e.date === today)
    if (ex) return !ex.closed
  }

  if (!openingHours || !Array.isArray(openingHours)) return null
  const day = openingHours[local.getUTCDay()]
  if (!day?.open) return false
  const now  = local.getUTCHours() * 60 + local.getUTCMinutes()
  const [fh, fm] = (day.from as string).split(':').map(Number)
  const [th, tm] = (day.to   as string).split(':').map(Number)
  return now >= fh * 60 + fm && now <= th * 60 + tm
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

function calcCourierFee(distanceKm: number): number {
  const BASE = 10
  const RATE = 2
  return Math.round((BASE + distanceKm * RATE) * 100) / 100
}

const STATUS_PUSH: Partial<Record<OrderStatus, { title: string; body: string }>> = {
  CONFIRMED:  { title: '✅ Pedido confirmado!',     body: 'A loja confirmou seu pedido e já está preparando.' },
  PREPARING:  { title: '👨‍🍳 Preparando seu pedido', body: 'A loja está preparando tudo com carinho.' },
  READY:      { title: '📦 Pedido pronto!',          body: 'Aguardando entregador para retirar.' },
  PICKED_UP:  { title: '🛵 Saiu para entrega!',     body: 'Seu pedido está a caminho. Fique de olho!' },
  DELIVERED:  { title: '🎉 Pedido entregue!',       body: 'Aproveite! Não esqueça de avaliar.' },
  CANCELLED:  { title: '❌ Pedido cancelado',        body: 'Seu pedido foi cancelado.' },
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name)

  constructor(
    private prisma: PrismaService,
    private coupons: CouponsService,
    private push: PushService,
    private notifications: NotificationsService,
    private payments: PaymentsService,
    private mpOauth: MpOauthService,
    @Optional() private matching: DeliveryMatchingService,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    const [store, payer] = await Promise.all([
      this.prisma.store.findUnique({
        where: { id: dto.storeId },
        include: { user: { select: { pushToken: true } } },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    ])
    if (!store) throw new BadRequestException('Loja não encontrada')

    // Marketplace (split): a loja precisa ter o Mercado Pago conectado pra receber.
    // Só bloqueia quando o marketplace está configurado (feature flag).
    const marketplaceOn = this.mpOauth.isEnabled()
    if (marketplaceOn && !(store as any).mpConnected) {
      throw new BadRequestException('Esta loja está finalizando a configuração de pagamentos e ainda não pode receber pedidos.')
    }

    // Validate the scheduled time (if any) — must be a valid future date
    let scheduledDate: Date | undefined
    if (dto.scheduledFor) {
      scheduledDate = new Date(dto.scheduledFor)
      if (isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
        throw new BadRequestException('O horário de agendamento deve ser uma data futura válida.')
      }
    }

    // The store must be open right now — unless the order is scheduled for later,
    // in which case it's fine for the store to be closed at the moment of ordering.
    if (!scheduledDate) {
      const openNow = isStoreOpenNow(store.openingHours, (store as any).scheduleExceptions)
      const closed  = openNow !== null ? !openNow : !store.isOpen
      if (closed) throw new BadRequestException('Esta loja está fechada no momento. Tente novamente mais tarde.')
    }

    // Check concurrent orders limit (null = unlimited; 0 treated as unlimited)
    const maxConcurrent = (store as any).maxConcurrentOrders
    if (maxConcurrent != null && maxConcurrent > 0) {
      const activeCount = await this.prisma.order.count({
        where: {
          storeId: store.id,
          status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] },
        },
      })
      if (activeCount >= maxConcurrent) {
        throw new BadRequestException('A loja está com capacidade máxima no momento. Tente novamente em breve.')
      }
    }

    const address = await this.prisma.address.findFirst({
      where: { id: dto.addressId, userId },
    })
    if (!address) throw new NotFoundException('Address not found')

    // Calculate distance once — reused for per-product limit validation and delivery fee
    const distToAddress = haversineKm(store.lat, store.lng, address.lat, address.lng)

    let subtotal = 0
    const orderItems: {
      productId: string
      variationId?: string
      quantity: number
      unitPrice: number
      notes?: string
    }[] = []
    const stockDecrements: { id: string; type: 'variation' | 'product'; by: number }[] = []

    for (const item of dto.items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
        include: { variations: true },
      })
      if (!product || !product.isActive) {
        throw new BadRequestException(`Product ${item.productId} not available`)
      }

      if (product.stock !== null && product.stock < item.quantity) {
        throw new BadRequestException(`Produto "${product.name}" tem apenas ${product.stock} unidade(s) disponível(is).`)
      }

      // Validate delivery distance limit per product (uses pre-calculated distance)
      const productMaxKm = (product as any).maxDeliveryKm
      if (productMaxKm != null && productMaxKm > 0 && distToAddress > productMaxKm) {
        throw new BadRequestException(
          `"${product.name}" não pode ser entregue a ${distToAddress.toFixed(1)} km — limite deste produto é ${productMaxKm} km.`
        )
      }

      let unitPrice = Number(product.basePrice ?? 0)

      if (item.variationId) {
        const variation = product.variations.find((v) => v.id === item.variationId)
        if (!variation || !variation.isActive) throw new BadRequestException('Variation not available')
        // stock === null means unlimited; only check when it's a defined number
        if (variation.stock !== null && variation.stock < item.quantity) {
          throw new BadRequestException(`Variação "${variation.name}" tem apenas ${variation.stock} unidade(s) disponível(is).`)
        }
        unitPrice = Number(variation.price)
        stockDecrements.push({ id: variation.id, type: 'variation', by: item.quantity })
      } else {
        if (product.stock !== null) stockDecrements.push({ id: product.id, type: 'product', by: item.quantity })
      }

      subtotal += unitPrice * item.quantity
      orderItems.push({
        productId: item.productId,
        variationId: item.variationId,
        quantity: item.quantity,
        unitPrice,
        notes: item.notes,
      })
    }

    // Normaliza o subtotal a centavos (evita floats tipo 59.9999 chegando ao gateway)
    subtotal = Math.round(subtotal * 100) / 100

    const distanceKm = distToAddress // already calculated above
    const deliveryFee = calcCourierFee(distanceKm)

    let discount = 0
    let couponId: string | undefined
    let couponMaxUses: number | null = null
    if (dto.couponCode) {
      const result = await this.coupons.validate(dto.couponCode, userId, subtotal, dto.storeId)
      discount = result.discount
      couponId = result.coupon.id
      couponMaxUses = (result.coupon as any).maxUses ?? null
    }

    // ── Loyalty redemption (100 pts = R$10) ──────────────────────────────
    // Validated here and applied atomically inside the transaction below.
    let loyaltyRedeem = 0
    let loyaltyAccountId: string | undefined
    if (dto.pointsToRedeem && dto.pointsToRedeem > 0) {
      const pts = Math.floor(dto.pointsToRedeem)
      if (pts < 100 || pts % 100 !== 0) {
        throw new BadRequestException('Resgate de pontos deve ser em múltiplos de 100 (mínimo 100).')
      }
      const account = await this.prisma.loyaltyAccount.findUnique({ where: { userId } })
      if (!account || account.points < pts) {
        throw new BadRequestException('Saldo de pontos insuficiente para o resgate.')
      }
      // O desconto (cupom + fidelidade) só incide sobre os PRODUTOS, nunca sobre a
      // taxa de entrega — assim o total nunca zera (total >= deliveryFee > 0) e o
      // entregador/loja sempre têm de onde ser pagos. Limita ao que ainda "cabe".
      const maxExtra = Math.max(0, subtotal - discount)
      let loyaltyDiscount = (pts / 100) * 10
      if (loyaltyDiscount > maxExtra) {
        const usableBlocks = Math.floor(maxExtra / 10)
        loyaltyRedeem = usableBlocks * 100
        loyaltyDiscount = usableBlocks * 10
      } else {
        loyaltyRedeem = pts
      }
      if (loyaltyRedeem > 0) {
        discount += loyaltyDiscount
        loyaltyAccountId = account.id
      }
    }

    // Segurança extra: o desconto nunca ultrapassa o subtotal (a entrega sempre é paga).
    if (discount > subtotal) discount = subtotal
    const total = Math.round((subtotal + deliveryFee - discount) * 100) / 100

    // Create payment + order in a single transaction to avoid orphaned records
    const { payment, order } = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: { method: dto.paymentMethod, amount: total, status: 'PENDING' },
      })

      const order = await tx.order.create({
        data: {
          userId,
          storeId: dto.storeId,
          addressId: dto.addressId,
          paymentId: payment.id,
          couponId,
          subtotal,
          deliveryFee,
          discount,
          total,
          notes: dto.notes,
          scheduledFor: scheduledDate,
          items: { create: orderItems },
        },
        include: {
          items: { include: { product: true, variation: true } },
          payment: true,
          address: true,
          store: { select: { id: true, name: true, logoUrl: true } },
        },
      })

      // Log initial status in audit trail
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: 'PENDING', changedBy: userId, note: 'Pedido criado' },
      })

      // Coupon use — @@unique([couponId,userId]) barra reuso pelo mesmo usuário;
      // o incremento do limite GLOBAL é condicional/atômico (barra estouro do maxUses).
      if (couponId) {
        await tx.couponUse.create({ data: { couponId, userId, orderId: order.id } })
        const upd = await tx.coupon.updateMany({
          where: couponMaxUses != null ? { id: couponId, usedCount: { lt: couponMaxUses } } : { id: couponId },
          data: { usedCount: { increment: 1 } },
        })
        if (upd.count === 0) throw new BadRequestException('Este cupom atingiu o limite de usos.')
      }

      // Loyalty redemption — decremento ATÔMICO condicional (evita resgate acima do
      // saldo em checkouts simultâneos). Só registra o ledger se realmente debitou.
      if (loyaltyAccountId && loyaltyRedeem > 0) {
        const res = await tx.loyaltyAccount.updateMany({
          where: { id: loyaltyAccountId, points: { gte: loyaltyRedeem } },
          data: { points: { decrement: loyaltyRedeem } },
        })
        if (res.count === 0) {
          throw new BadRequestException('Saldo de pontos insuficiente para o resgate.')
        }
        await tx.loyaltyTransaction.create({
          data: {
            accountId: loyaltyAccountId,
            points: -loyaltyRedeem,
            type: 'REDEEM',
            description: `Resgate de ${loyaltyRedeem} pontos (R$ ${((loyaltyRedeem / 100) * 10).toFixed(2)} de desconto)`,
            orderId: order.id,
          },
        })
      }

      return { payment, order }
    })

    // Decrement stock (best-effort; stock is advisory not a hard constraint here)
    await Promise.all(
      stockDecrements.map(({ id, type, by }) => {
        if (type === 'variation') {
          return this.prisma.productVariation.updateMany({ where: { id }, data: { stock: { decrement: by } } })
            .catch((err) => this.logger.warn(`Stock decrement failed for variation ${id}`, err))
        }
        return this.prisma.product.updateMany({ where: { id }, data: { stock: { decrement: by } } })
          .catch((err) => this.logger.warn(`Stock decrement failed for product ${id}`, err))
      }),
    )

    // Split de pagamento (marketplace): cobra na conta do lojista e retém a
    // comissão da plataforma + a taxa de entrega (com que a plataforma paga o entregador).
    let splitOpts: { sellerToken?: string | null; applicationFee?: number } | undefined
    if (marketplaceOn) {
      const sellerToken = await this.mpOauth.getValidSellerToken(store as any)
      const platformCommission = Math.round(subtotal * 0.10 * 100) / 100
      // A taxa da plataforma NUNCA pode passar do total cobrado (senão o MP recusa
      // e o lojista receberia valor negativo). Descontos reduzem primeiro a parte da loja.
      const rawFee = platformCommission + deliveryFee
      const applicationFee = Math.max(0, Math.min(rawFee, Math.round(total * 100) / 100))
      splitOpts = { sellerToken, applicationFee }
    }

    // PIX — await so the QR code is available when the response returns
    if (dto.paymentMethod === 'PIX') {
      try {
        await this.payments.createPixPayment(
          payment.id, total, order.id, payer?.email ?? 'cliente@tabarato.com.br',
          splitOpts,
        )
      } catch (err) {
        this.logger.error('PIX payment creation failed after order was saved', err)
        throw new BadRequestException('Não foi possível gerar o QR Code PIX. Tente outro método de pagamento.')
      }
    }

    // Card payment — synchronous
    if (['CREDIT_CARD', 'DEBIT_CARD'].includes(dto.paymentMethod) && dto.cardToken) {
      try {
        const result = await this.payments.createCardPayment(
          payment.id, total, order.id,
          dto.cardToken,
          dto.installments ?? 1,
          payer?.email ?? 'cliente@tabarato.com.br',
          dto.payerCpf,
          splitOpts,
        )
        if (result.status === 'PAID') {
          await this.prisma.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } })
          if (store.user?.pushToken) {
            this.push.send(store.user.pushToken, '✅ Pedido pago!', `Pedido #${order.id.slice(0, 8)} pago com cartão.`, { orderId: order.id })
          }
          this.notifications.create(store.userId, 'ORDER_UPDATE', '✅ Pedido pago!', `Pedido #${order.id.slice(0, 8)} · R$ ${total.toFixed(2)}`, { orderId: order.id })
            .catch((err) => this.logger.warn('Store notification failed', err))
        } else if (result.status === 'FAILED') {
          await this.prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } })
          await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } })
          throw new BadRequestException(`Pagamento recusado. Motivo: ${result.statusDetail ?? 'cartão não autorizado'}. Verifique os dados e tente novamente.`)
        }
      } catch (err: any) {
        if (err?.status === 400) throw err
        throw new BadRequestException('Não foi possível processar o pagamento com cartão. Tente outro método.')
      }
    }

    if (store.user?.pushToken) {
      this.push.send(
        store.user.pushToken,
        '🛒 Novo pedido!',
        'Você recebeu um novo pedido. Toque para ver.',
        { orderId: order.id },
      )
    }

    this.notifications.create(
      store.userId,
      'ORDER_UPDATE',
      '🛒 Novo pedido!',
      `Pedido #${order.id.slice(0, 8)} · R$ ${total.toFixed(2)}`,
      { orderId: order.id },
    ).catch((err) => this.logger.warn('Store notification failed', err))

    return order
  }

  async findByUser(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: {
        store: { select: { id: true, name: true, logoUrl: true } },
        items: {
          include: { product: { select: { id: true, name: true, imageUrl: true } } },
        },
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findByStore(userId: string) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')

    return this.prisma.order.findMany({
      where: { storeId: store.id },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        items: { include: { product: true, variation: true } },
        address: true,
        payment: true,
        delivery: { include: { courier: { include: { user: { select: { name: true, phone: true } } } } } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findById(id: string, userId: string, userRole: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        store: true,
        items: { include: { product: true, variation: true } },
        address: true,
        payment: true,
        delivery: {
          include: {
            courier: { include: { user: { select: { name: true, phone: true } } } },
          },
        },
      },
    })
    if (!order) throw new NotFoundException('Order not found')

    // Só quem tem relação com o pedido pode vê-lo:
    // consumidor dono, dono da loja, entregador ATRIBUÍDO, ou admin.
    const isOwner = order.userId === userId
    const isStoreOwner = (order as any).store?.userId === userId
    const isAssignedCourier = (order as any).delivery?.courier?.userId === userId
    const isAdmin = userRole === 'ADMIN'
    if (!isOwner && !isStoreOwner && !isAssignedCourier && !isAdmin) {
      throw new ForbiddenException()
    }

    return order
  }

  async updateStatus(userId: string, orderId: string, status: OrderStatus, refusalNote?: string) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new ForbiddenException()

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId: store.id },
      include: {
        address: { select: { lat: true, lng: true } },
        payment: { select: { status: true } },
      },
    })
    if (!order) throw new NotFoundException('Order not found')

    // A loja não pode preparar/despachar um pedido que ainda não foi pago
    // (ex.: PIX gerado e nunca pago). Cancelar/recusar sempre é permitido.
    if (['CONFIRMED', 'PREPARING', 'READY'].includes(status) && order.payment?.status !== 'PAID') {
      throw new BadRequestException('O pedido ainda não foi pago.')
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status, refusalNote },
      include: { user: { select: { pushToken: true } } },
    })

    // Audit log
    this.prisma.orderStatusHistory.create({
      data: { orderId, status, changedBy: userId, note: refusalNote },
    }).catch((err) => this.logger.warn('Audit log failed', err))

    if (status === 'READY') {
      const existing = await this.prisma.delivery.findUnique({ where: { orderId } })
      if (!existing) {
        const distanceKm = haversineKm(store.lat, store.lng, order.address.lat, order.address.lng)
        const courierFee  = calcCourierFee(distanceKm)
        const delivery    = await this.prisma.delivery.create({
          data: {
            orderId,
            distanceKm: Math.round(distanceKm * 10) / 10,
            courierFee,
            status: 'SEARCHING_COURIER',
          },
        })
        this.matching?.startMatching(delivery.id, store.lat, store.lng).catch((err) => {
          this.logger.warn('Auto-match start failed', err)
        })
      }
    }

    const pushMsg = STATUS_PUSH[status]
    if (pushMsg && updated.user?.pushToken) {
      this.push.send(updated.user.pushToken, pushMsg.title, pushMsg.body, { orderId })
    }
    if (pushMsg) {
      this.notifications.create(order.userId, 'ORDER_UPDATE', pushMsg.title, pushMsg.body, { orderId })
        .catch((err) => this.logger.warn('Notification failed', err))
    }

    return updated
  }

  async cancel(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { user: { select: { pushToken: true } } },
    })
    if (!order) throw new NotFoundException('Order not found')
    if (!['PENDING', 'CONFIRMED'].includes(order.status)) {
      throw new BadRequestException('Order cannot be cancelled at this stage')
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    })

    const pushMsg = STATUS_PUSH['CANCELLED']
    if (pushMsg && order.user?.pushToken) {
      this.push.send(order.user.pushToken, pushMsg.title, pushMsg.body, { orderId })
    }
    this.notifications.create(userId, 'ORDER_UPDATE', '❌ Pedido cancelado', 'Seu pedido foi cancelado.', { orderId })
      .catch((err) => this.logger.warn('Notification failed', err))

    this.prisma.orderStatusHistory.create({
      data: { orderId, status: 'CANCELLED', changedBy: userId },
    }).catch((err) => this.logger.warn('Audit log failed', err))

    return updated
  }

  // Store owner can cancel even READY/PREPARING orders (before pickup)
  async cancelByStore(userId: string, orderId: string, note?: string) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new ForbiddenException()

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId: store.id },
      include: {
        user: { select: { id: true, pushToken: true } },
        delivery: { select: { status: true } },
      },
    })
    if (!order) throw new NotFoundException('Order not found')

    const cancellable = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY']
    if (!cancellable.includes(order.status)) {
      throw new BadRequestException('Não é possível cancelar um pedido já coletado ou entregue.')
    }

    // Guard: if courier already picked up the package, cannot cancel
    const deliveryAlreadyPickedUp = ['PICKED_UP', 'HEADING_TO_CLIENT', 'DELIVERED'].includes(
      (order as any).delivery?.status ?? ''
    )
    if (deliveryAlreadyPickedUp) {
      throw new BadRequestException('Não é possível cancelar: o entregador já coletou o pedido.')
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', refusalNote: note },
    })

    if (order.user?.pushToken) {
      this.push.send(order.user.pushToken, '❌ Pedido cancelado', note ?? 'A loja cancelou seu pedido.', { orderId })
    }
    this.notifications.create(order.user.id, 'ORDER_UPDATE', '❌ Pedido cancelado pela loja',
      note ?? 'A loja cancelou seu pedido.', { orderId }).catch((err) => this.logger.warn('Audit log failed', err))

    this.prisma.orderStatusHistory.create({
      data: { orderId, status: 'CANCELLED', changedBy: userId, note },
    }).catch((err) => this.logger.warn('Audit log failed', err))

    return updated
  }

  async getStatusHistory(orderId: string, userId: string, userRole: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        userId: true,
        store: { select: { userId: true } },
        delivery: { select: { courier: { select: { userId: true } } } },
      },
    })
    if (!order) throw new NotFoundException('Order not found')

    const isOwner = order.userId === userId
    const isStoreOwner = order.store?.userId === userId
    const isAssignedCourier = order.delivery?.courier?.userId === userId
    if (!isOwner && !isStoreOwner && !isAssignedCourier && userRole !== 'ADMIN') {
      throw new ForbiddenException()
    }

    return this.prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    })
  }
}
