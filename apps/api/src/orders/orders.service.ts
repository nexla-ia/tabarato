import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { OrderStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CouponsService } from '../coupons/coupons.service'
import { PushService } from '../common/push.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PaymentsService } from '../payments/payments.service'
import { DeliveryMatchingService } from '../couriers/delivery-matching.service'
import { CreateOrderDto } from './dto/create-order.dto'

// Vilhena-RO runs at UTC-4 (no DST)
function isStoreOpenNow(openingHours: any): boolean | null {
  if (!openingHours || !Array.isArray(openingHours)) return null
  const localMs  = Date.now() - 4 * 60 * 60 * 1000
  const local    = new Date(localMs)
  const day      = openingHours[local.getUTCDay()]
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
  const RATE = 2 // R$/km
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
  constructor(
    private prisma: PrismaService,
    private coupons: CouponsService,
    private push: PushService,
    private notifications: NotificationsService,
    private payments: PaymentsService,
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

    // Check real-time opening hours first; fall back to the isOpen flag
    const openNow = isStoreOpenNow(store.openingHours)
    const closed  = openNow !== null ? !openNow : !store.isOpen
    if (closed) throw new BadRequestException('Esta loja está fechada no momento. Tente novamente mais tarde.')

    const address = await this.prisma.address.findFirst({
      where: { id: dto.addressId, userId },
    })
    if (!address) throw new NotFoundException('Address not found')

    let subtotal = 0
    const orderItems: {
      productId: string
      variationId?: string
      quantity: number
      unitPrice: number
      notes?: string
    }[] = []
    const stockDecrements: { id: string; by: number }[] = []

    for (const item of dto.items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
        include: { variations: true },
      })
      if (!product || !product.isActive) {
        throw new BadRequestException(`Product ${item.productId} not available`)
      }

      // Stock check
      if (product.stock !== null && product.stock < item.quantity) {
        throw new BadRequestException(`Produto "${product.name}" tem apenas ${product.stock} unidade(s) disponível(is).`)
      }

      let unitPrice = product.basePrice ?? 0

      if (item.variationId) {
        const variation = product.variations.find((v) => v.id === item.variationId)
        if (!variation || !variation.isActive) throw new BadRequestException('Variation not available')
        if (variation.stock < item.quantity) {
          throw new BadRequestException(`Variação "${variation.name}" tem apenas ${variation.stock} unidade(s) disponível(is).`)
        }
        unitPrice = variation.price
        stockDecrements.push({ id: variation.id, by: item.quantity })
      } else {
        if (product.stock !== null) stockDecrements.push({ id: product.id, by: item.quantity })
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

    const distanceKm = haversineKm(store.lat, store.lng, address.lat, address.lng)
    const deliveryFee = calcCourierFee(distanceKm)

    // Apply coupon if provided
    let discount = 0
    let couponId: string | undefined
    if (dto.couponCode) {
      const result = await this.coupons.validate(dto.couponCode, userId, subtotal, dto.storeId)
      discount = result.discount
      couponId = result.coupon.id
    }

    const total = subtotal + deliveryFee - discount

    const payment = await this.prisma.payment.create({
      data: { method: dto.paymentMethod, amount: total, status: 'PENDING' },
    })

    const order = await this.prisma.order.create({
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
        items: { create: orderItems },
      },
      include: {
        items: { include: { product: true, variation: true } },
        payment: true,
        address: true,
        store: { select: { id: true, name: true, logoUrl: true } },
      },
    })

    if (couponId) {
      await this.prisma.$transaction([
        this.prisma.couponUse.create({ data: { couponId, userId, orderId: order.id } }),
        this.prisma.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } }),
      ])
    }

    // Decrement stock
    await Promise.all(
      stockDecrements.map(({ id, by }) =>
        this.prisma.productVariation.updateMany({ where: { id }, data: { stock: { decrement: by } } })
          .catch(() =>
            this.prisma.product.updateMany({ where: { id }, data: { stock: { decrement: by } } }),
          ),
      ),
    )

    // Create MP payment for PIX — fire-and-forget (order already saved)
    if (dto.paymentMethod === 'PIX') {
      this.payments.createPixPayment(
        payment.id, total, order.id, payer?.email ?? 'cliente@tabarato.com.br',
      ).catch(() => {})
    }

    // Card payment — synchronous, update order status immediately
    if (['CREDIT_CARD', 'DEBIT_CARD'].includes(dto.paymentMethod) && dto.cardToken) {
      try {
        const result = await this.payments.createCardPayment(
          payment.id, total, order.id,
          dto.cardToken,
          dto.installments ?? 1,
          payer?.email ?? 'cliente@tabarato.com.br',
          dto.payerCpf,
        )
        if (result.status === 'PAID') {
          await this.prisma.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } })
          if (store.user?.pushToken) {
            this.push.send(store.user.pushToken, '✅ Pedido pago!', `Pedido #${order.id.slice(0, 8)} pago com cartão.`, { orderId: order.id })
          }
          this.notifications.create(store.userId, 'ORDER_UPDATE', '✅ Pedido pago!', `Pedido #${order.id.slice(0, 8)} · R$ ${total.toFixed(2)}`, { orderId: order.id }).catch(() => {})
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

    // In-app notification for store owner
    this.notifications.create(
      store.userId,
      'ORDER_UPDATE',
      '🛒 Novo pedido!',
      `Pedido #${order.id.slice(0, 8)} · R$ ${total.toFixed(2)}`,
      { orderId: order.id },
    ).catch(() => {})

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

    const isOwner = order.userId === userId
    const isElevated = ['STORE_OWNER', 'ADMIN', 'COURIER'].includes(userRole)
    if (!isOwner && !isElevated) throw new ForbiddenException()

    return order
  }

  async updateStatus(userId: string, orderId: string, status: OrderStatus, refusalNote?: string) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new ForbiddenException()

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId: store.id },
      include: {
        address: { select: { lat: true, lng: true } },
      },
    })
    if (!order) throw new NotFoundException('Order not found')

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status, refusalNote },
      include: { user: { select: { pushToken: true } } },
    })

    // Auto-create delivery when order is ready and start auto-match
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
        // Start auto-match: 1km → 2km → 3km, 30s per radius
        this.matching?.startMatching(delivery.id, store.lat, store.lng).catch(() => {})
      }
    }

    const pushMsg = STATUS_PUSH[status]
    if (pushMsg && updated.user?.pushToken) {
      this.push.send(updated.user.pushToken, pushMsg.title, pushMsg.body, { orderId })
    }
    if (pushMsg) {
      this.notifications.create(order.userId, 'ORDER_UPDATE', pushMsg.title, pushMsg.body, { orderId }).catch(() => {})
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
    this.notifications.create(userId, 'ORDER_UPDATE', '❌ Pedido cancelado', 'Seu pedido foi cancelado.', { orderId }).catch(() => {})

    return updated
  }
}
