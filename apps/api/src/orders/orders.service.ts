import { BadRequestException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { randomInt } from 'crypto'
import { OrderStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CouponsService } from '../coupons/coupons.service'
import { PushService } from '../common/push.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PaymentsService } from '../payments/payments.service'
import { MpOauthService } from '../payments/mp-oauth.service'
import { DeliveryMatchingService } from '../couriers/delivery-matching.service'
import { OrderConsumptionService } from './order-consumption.service'
import { CreateOrderDto } from './dto/create-order.dto'

function isStoreOpenNow(openingHours: any, scheduleExceptions?: any, atMs: number = Date.now()): boolean | null {
  const localMs = atMs - 4 * 60 * 60 * 1000
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
  const fromMin = fh * 60 + fm
  const toMin   = th * 60 + tm
  // Cruza a meia-noite (ex.: 18:00 → 02:00)
  if (toMin < fromMin) return now >= fromMin || now <= toMin
  return now >= fromMin && now <= toMin
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

// Desconto progressivo "Leve X Pague Y": a cada X unidades, (X-Y) saem de graça.
// Ex.: leve 3 pague 2 (buy=3, pay=2) → 1 grátis a cada 3. Retorna o VALOR do desconto.
function promoDiscountFor(quantity: number, unitPrice: number, buyQty?: number | null, payQty?: number | null): number {
  if (!buyQty || !payQty || buyQty <= payQty || buyQty <= 0 || quantity < buyQty) return 0
  const freeUnits = Math.floor(quantity / buyQty) * (buyQty - payQty)
  return Math.round(freeUnits * unitPrice * 100) / 100
}

/**
 * E-mail do pagador aceito pelo Mercado Pago. O MP rejeita o pagamento
 * ("payer.email must be a valid email") quando o e-mail é malformado ou usa um
 * TLD reservado (.test/.local/.invalid/.example) — comum em contas de teste. Se
 * o e-mail do cliente não for válido, usa um fallback válido da plataforma.
 */
function safePayerEmail(email?: string | null): string {
  const FALLBACK = 'comprador@tabarato.com.br'
  if (!email) return FALLBACK
  const e = email.trim().toLowerCase()
  const looksValid = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e)
  const reservedTld = /\.(test|local|invalid|example|localhost)$/.test(e)
  return looksValid && !reservedTld ? e : FALLBACK
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
    private orderConsumption: OrderConsumptionService,
    @Optional() private matching: DeliveryMatchingService,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    // Idempotência: se já existe um pedido com essa chave, devolve o mesmo
    // (evita pedido/cobrança duplicada em retry de rede ou duplo-tap no checkout).
    if (dto.idempotencyKey) {
      const existing = await this.prisma.payment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: {
          orders: {
            include: {
              items: { include: { product: true, variation: true } },
              payment: true, address: true,
              store: { select: { id: true, name: true, logoUrl: true } },
            },
          },
        },
      })
      const prev = existing?.orders?.[0]
      // Escopo por usuário: a idempotencyKey de outro cliente NÃO pode devolver o
      // pedido dele (vazaria endereço/itens e o deliveryCode anti-fraude).
      if (prev && (prev as any).userId !== userId) throw new ForbiddenException()
      if (prev) {
        // Só devolve o pedido anterior se ele ainda estiver VIVO. Se a tentativa
        // anterior morreu (PIX não gerou o QR ou cartão recusado → pedido CANCELLED
        // e pagamento FAILED), NÃO devolver o pedido morto como se fosse sucesso —
        // senão o app troca de método, reenvia a MESMA chave e recebe de volta o
        // pedido cancelado (mostrando "pago" sem nunca cobrar). Exige nova tentativa
        // (o app gera uma idempotencyKey nova ao trocar de método / após erro).
        const dead = prev.status === 'CANCELLED' || (existing as any).status === 'FAILED'
        if (!dead) return prev
        throw new BadRequestException('A tentativa de pagamento anterior não foi concluída. Refaça o pedido.')
      }
    }

    // Caminho legado (1 loja). O multi-loja é roteado pra createMulti no controller.
    const storeId = dto.storeId
    const items = dto.items
    if (!storeId || !items || !items.length) throw new BadRequestException('Pedido inválido: informe a loja e os itens.')

    const [store, payer] = await Promise.all([
      this.prisma.store.findUnique({
        where: { id: storeId },
        include: { user: { select: { pushToken: true } } },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, phone: true, createdAt: true } }),
    ])
    if (!store) throw new BadRequestException('Loja não encontrada')

    // Loja precisa estar APROVADA para receber pedidos (barra loja pendente/suspensa
    // acessada por storeId direto, fora da listagem que já filtra por APPROVED).
    if ((store as any).status !== 'APPROVED') {
      throw new BadRequestException('Esta loja não está disponível para pedidos no momento.')
    }

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
      // Fechada se: fora do horário, ou isOpen false, ou pausada manualmente pelo lojista.
      const closed = (openNow !== null ? !openNow : !store.isOpen) || (store as any).isPaused
      if (closed) throw new BadRequestException('Esta loja está fechada no momento. Tente novamente mais tarde.')
    } else {
      // Agendamento: o horário escolhido tem que cair dentro do funcionamento da loja.
      const openAt = isStoreOpenNow(store.openingHours, (store as any).scheduleExceptions, scheduledDate.getTime())
      if (openAt === false) throw new BadRequestException('A loja não funciona no horário agendado. Escolha outro horário.')
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
    let promoDiscount = 0
    const orderItems: {
      productId: string
      variationId?: string
      quantity: number
      unitPrice: number
      notes?: string
    }[] = []
    // Itens formatados pro MP (additional_info) — melhora o score do antifraude.
    const mpItems: { id: string; title: string; quantity: number; unit_price: number }[] = []
    const stockDecrements: { id: string; type: 'variation' | 'product'; by: number }[] = []

    for (const item of items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
        include: { variations: true },
      })
      if (!product || !product.isActive) {
        throw new BadRequestException(`Product ${item.productId} not available`)
      }
      // O produto TEM que ser da loja informada (igual ao prepareStoreGroup). Sem isso
      // dá pra pedir produto de outra loja sob esta, furar estoque/roteamento e abusar
      // do cupom da loja informada.
      if (product.storeId !== storeId) {
        throw new BadRequestException('Um item não pertence à loja informada.')
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
      promoDiscount += promoDiscountFor(item.quantity, unitPrice, (product as any).promoBuyQty, (product as any).promoPayQty)
      orderItems.push({
        productId: item.productId,
        variationId: item.variationId,
        quantity: item.quantity,
        unitPrice,
        notes: item.notes,
      })
      mpItems.push({ id: item.productId, title: product.name, quantity: item.quantity, unit_price: unitPrice })
    }

    // Normaliza o subtotal a centavos (evita floats tipo 59.9999 chegando ao gateway)
    subtotal = Math.round(subtotal * 100) / 100
    promoDiscount = Math.round(promoDiscount * 100) / 100

    const distanceKm = distToAddress // already calculated above
    const deliveryFee = calcCourierFee(distanceKm)

    // Descontos separados por QUEM os custeia:
    //  • cupom  → absorvido pela LOJA (promoção dela)
    //  • fidelidade → absorvido pela PLATAFORMA (programa dela)
    let couponDiscount = 0
    let couponId: string | undefined
    let couponMaxUses: number | null = null
    let couponFreeShipping = false
    if (dto.couponCode) {
      const result = await this.coupons.validate(dto.couponCode, userId, subtotal, storeId)
      couponDiscount = result.discount
      couponId = result.coupon.id
      couponMaxUses = (result.coupon as any).maxUses ?? null
      couponFreeShipping = Boolean(result.freeShipping)
      // Cupom + promoção nunca passam do subtotal (evita total zerado/negativo).
      couponDiscount = Math.round(Math.min(couponDiscount, Math.max(0, subtotal - promoDiscount)) * 100) / 100
    }

    // ── Loyalty redemption (100 pts = R$10) ──────────────────────────────
    let loyaltyDiscount = 0
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
      // Desconto só sobre PRODUTOS (nunca a entrega) e sem passar do que resta após cupom+promoção.
      const maxExtra = Math.max(0, subtotal - couponDiscount - promoDiscount)
      let ld = (pts / 100) * 10
      if (ld > maxExtra) {
        const usableBlocks = Math.floor(maxExtra / 10)
        loyaltyRedeem = usableBlocks * 100
        ld = usableBlocks * 10
      } else {
        loyaltyRedeem = pts
      }
      if (loyaltyRedeem > 0) {
        loyaltyDiscount = ld
        loyaltyAccountId = account.id
      }
    }

    let discount = Math.round((couponDiscount + loyaltyDiscount + promoDiscount) * 100) / 100
    if (discount > subtotal) discount = subtotal // segurança: desconto de produto nunca passa do subtotal
    // Cupom de frete grátis: o cliente NÃO paga a entrega (a loja absorve — abatido
    // do repasse dela na entrega). deliveryFee continua gravado (o entregador recebe).
    const deliveryWaived = couponFreeShipping ? deliveryFee : 0
    const total = Math.round((subtotal + deliveryFee - discount - deliveryWaived) * 100) / 100

    // Código de entrega (anti-fraude): 6 dígitos CRIPTOGRÁFICOS que o cliente informa
    // ao entregador. Sem ele, o entregador não finaliza a corrida (padrão iFood).
    // 6 dígitos (900k combinações) + bloqueio por tentativas tornam brute-force inviável.
    const deliveryCode = String(randomInt(100000, 1000000))

    // Guarda: descontos não podem zerar o pedido (MP não cobra R$0).
    if (total <= 0) {
      throw new BadRequestException('Os descontos deixaram o total em R$ 0,00. Remova um cupom ou promoção para continuar.')
    }

    // Create payment + order in a single transaction to avoid orphaned records
    const { payment, order } = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: { method: dto.paymentMethod, amount: total, status: 'PENDING', idempotencyKey: dto.idempotencyKey },
      })

      const order = await tx.order.create({
        data: {
          userId,
          storeId,
          addressId: dto.addressId,
          paymentId: payment.id,
          couponId,
          subtotal,
          deliveryFee,
          discount,
          couponDiscount,
          loyaltyDiscount,
          promoDiscount,
          freeShipping: couponFreeShipping,
          total,
          notes: dto.notes,
          scheduledFor: scheduledDate,
          deliveryCode,
          // Marca se o pagamento será cobrado via split (dinheiro cai direto na loja).
          // Lido no repasse (evita creditar a loja 2x) e no estorno (qual token usar).
          paidViaSplit: marketplaceOn && ['PIX', 'CREDIT_CARD', 'DEBIT_CARD'].includes(dto.paymentMethod),
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

      // Decremento de estoque ATÔMICO e condicional (dentro da transação): evita
      // oversell em compras simultâneas — se não houver estoque, aborta o pedido.
      for (const { id, type, by } of stockDecrements) {
        const res = type === 'variation'
          ? await tx.productVariation.updateMany({ where: { id, stock: { gte: by } }, data: { stock: { decrement: by } } })
          : await tx.product.updateMany({ where: { id, stock: { gte: by } }, data: { stock: { decrement: by } } })
        if (res.count === 0) {
          throw new BadRequestException('Estoque insuficiente para um dos itens. Revise seu carrinho.')
        }
      }

      return { payment, order }
    })

    // Split de pagamento (marketplace): cobra na conta do lojista e retém a
    // comissão da plataforma + a taxa de entrega (com que a plataforma paga o entregador).
    let splitOpts: { sellerToken?: string | null; applicationFee?: number } | undefined
    if (marketplaceOn) {
      const sellerToken = await this.mpOauth.getValidSellerToken(store as any)
      const platformCommission = Math.round(subtotal * 0.10 * 100) / 100
      // Loja recebe (total − fee). Queremos que a loja fique com:
      //   subtotal − cupom − comissão  (absorve o cupom, NÃO a fidelidade)
      // → fee = comissão + entrega − fidelidade (a plataforma banca a fidelidade).
      // Clamp em [0, total]: o split do MP não deixa a fee ser negativa nem > total.
      const rawFee = platformCommission + deliveryFee - loyaltyDiscount
      const applicationFee = Math.max(0, Math.min(Math.round(rawFee * 100) / 100, total))
      splitOpts = { sellerToken, applicationFee }
    }

    // PIX — await so the QR code is available when the response returns
    if (dto.paymentMethod === 'PIX') {
      try {
        const pixResult = await this.payments.createPixPayment(
          payment.id, total, order.id, safePayerEmail(payer?.email),
          splitOpts,
        )
        // O split foi recusado pelo MP e caiu pro modo centralizado — o dinheiro
        // não está na conta da loja, então reembolso futuro não pode usar o token
        // dela (ver refundPayment). Comissão precisa ser retida manualmente aqui.
        if (pixResult.splitFellBack) {
          await this.prisma.order.update({ where: { id: order.id }, data: { paidViaSplit: false } }).catch(() => {})
        }
        // Reflete o código PIX no objeto retornado (ele veio da transação, ANTES do
        // PIX existir) pra o app já receber o QR/copia-e-cola na resposta do checkout.
        if ((order as any).payment) {
          Object.assign((order as any).payment, {
            gatewayId: pixResult.gatewayId,
            pixCode: pixResult.pixCode,
            pixQrBase64: pixResult.pixQrBase64,
            pixExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
          })
        }
      } catch (err: any) {
        this.logger.error('PIX payment creation failed after order was saved', err)
        // Pedido já gravado mas o PIX não foi gerado: cancela e devolve estoque/cupom/pontos.
        await this.prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } }).catch(() => {})
        await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } }).catch(() => {})
        await this.restoreOrderConsumption(order.id)
        // Mensagem amigável ao cliente (o erro cru do MP é técnico/inglês; o detalhe
        // completo fica no log acima). Caso clássico: "Collector user without key
        // enabled for QR render" = a conta MP da loja não tem chave PIX cadastrada.
        const raw = typeof err?.message === 'string' ? err.message : ''
        const semChavePix = /without key enabled for QR|key enabled|sem chave|no pix key/i.test(raw)
        throw new BadRequestException(
          semChavePix
            ? 'Esta loja ainda não habilitou o PIX na conta de pagamento. Pague com cartão ou tente novamente mais tarde.'
            : 'Não foi possível gerar o QR Code PIX agora. Tente pagar com cartão.',
        )
      }
    }

    // Card payment — synchronous
    if (['CREDIT_CARD', 'DEBIT_CARD'].includes(dto.paymentMethod) && dto.cardToken) {
      try {
        // Dados ricos do pagador reduzem o "cc_rejected_high_risk" do antifraude do MP.
        const nameParts = (payer?.name ?? '').trim().split(/\s+/).filter(Boolean)
        const payerFirstName = nameParts[0]
        const payerLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined
        const payerPhone = (payer?.phone ?? '').replace(/\D/g, '') || undefined
        const result = await this.payments.createCardPayment(
          payment.id, total, order.id,
          dto.cardToken,
          dto.installments ?? 1,
          safePayerEmail(payer?.email),
          dto.payerCpf,
          {
            ...splitOpts,
            payerFirstName,
            payerLastName,
            payerPhone,
            payerRegDate: payer?.createdAt ? payer.createdAt.toISOString() : undefined,
            items: mpItems,
            deviceId: dto.deviceId,
            payerAddress: {
              zip_code: address.zipCode?.replace(/\D/g, ''),
              street_name: address.street,
              street_number: address.number,
            },
          },
        )
        if (result.splitFellBack) {
          await this.prisma.order.update({ where: { id: order.id }, data: { paidViaSplit: false } }).catch(() => {})
        }
        if (result.status === 'PAID') {
          await this.prisma.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } })
          // Cliente: confirmação imediata (no cartão; no PIX vem pelo webhook). A loja
          // recebe o "🛒 Novo pedido!" logo abaixo — não duplica com "Pedido pago".
          const buyer = await this.prisma.user.findUnique({ where: { id: userId }, select: { pushToken: true } })
          if (buyer?.pushToken) {
            this.push.send(buyer.pushToken, '✅ Pagamento confirmado!', 'Seu pedido foi pago e já está sendo preparado.', { orderId: order.id })
          }
          this.notifications.create(userId, 'PAYMENT', '✅ Pagamento confirmado!', `Pedido #${order.id.slice(0, 8)} pago com sucesso.`, { orderId: order.id })
            .catch((err) => this.logger.warn('Buyer notification failed', err))
        } else if (result.status === 'FAILED') {
          await this.prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } })
          await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } })
          // Cartão recusado: devolve estoque, libera o cupom e re-credita os pontos.
          await this.restoreOrderConsumption(order.id)
          throw new BadRequestException(`Pagamento recusado. Motivo: ${result.statusDetail ?? 'cartão não autorizado'}. Verifique os dados e tente novamente.`)
        }
      } catch (err: any) {
        // Nossa própria exceção (ex.: "Pagamento recusado" acima) → repassa como está.
        // (Antes usava err?.status===400, mas um erro CRU do MP também tem status 400 →
        //  era re-lançado sem ser HttpException → o Nest devolvia 500.)
        if (err instanceof HttpException) throw err

        this.logger.error(`Card payment failed (order ${order.id.slice(0, 8)})`, err)
        // Cartão falhou: cancela o pedido e devolve estoque/cupom/pontos.
        await this.prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } }).catch(() => {})
        await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } }).catch(() => {})
        await this.restoreOrderConsumption(order.id)
        // Surface o motivo real do MP (ex.: valor abaixo do mínimo do cartão).
        const cause = Array.isArray(err?.cause) ? err.cause.map((c: any) => c?.description).filter(Boolean).join('; ') : ''
        const raw = (cause || err?.message || '').toString().slice(0, 160)
        throw new BadRequestException(`Não foi possível processar o pagamento com cartão${raw ? ` (${raw})` : ''}. Verifique os dados ou pague com PIX.`)
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

  // ─── Preparação (validação + preço) de UM grupo (1 loja) do carrinho multi-loja ───
  private async prepareStoreGroup(
    userId: string,
    group: { storeId: string; items: { productId: string; variationId?: string; quantity: number; notes?: string }[]; couponCode?: string },
    address: { lat: number; lng: number },
    scheduledDate: Date | undefined,
    marketplaceOn: boolean,
  ) {
    const store = await this.prisma.store.findUnique({
      where: { id: group.storeId },
      include: { user: { select: { id: true, pushToken: true } } },
    })
    if (!store) throw new BadRequestException('Loja não encontrada')
    if ((store as any).status !== 'APPROVED') throw new BadRequestException(`A loja "${store.name}" não está disponível para pedidos.`)
    if (marketplaceOn && !(store as any).mpConnected) {
      throw new BadRequestException(`A loja "${store.name}" está finalizando a configuração de pagamentos e ainda não pode receber pedidos.`)
    }
    if (!scheduledDate) {
      const openNow = isStoreOpenNow(store.openingHours, (store as any).scheduleExceptions)
      const closed = (openNow !== null ? !openNow : !store.isOpen) || (store as any).isPaused
      if (closed) throw new BadRequestException(`A loja "${store.name}" está fechada no momento.`)
    } else {
      const openAt = isStoreOpenNow(store.openingHours, (store as any).scheduleExceptions, scheduledDate.getTime())
      if (openAt === false) throw new BadRequestException(`A loja "${store.name}" não funciona no horário agendado. Escolha outro horário.`)
    }
    const maxConcurrent = (store as any).maxConcurrentOrders
    if (maxConcurrent != null && maxConcurrent > 0) {
      const activeCount = await this.prisma.order.count({
        where: { storeId: store.id, status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] } },
      })
      if (activeCount >= maxConcurrent) throw new BadRequestException(`A loja "${store.name}" está com capacidade máxima no momento.`)
    }

    const distToAddress = haversineKm(store.lat, store.lng, address.lat, address.lng)
    let subtotal = 0
    let promoDiscount = 0
    const orderItems: { productId: string; variationId?: string; quantity: number; unitPrice: number; notes?: string }[] = []
    const mpItems: { id: string; title: string; quantity: number; unit_price: number }[] = []
    const stockDecrements: { id: string; type: 'variation' | 'product'; by: number }[] = []

    for (const item of group.items) {
      const product = await this.prisma.product.findUnique({ where: { id: item.productId }, include: { variations: true } })
      if (!product || !product.isActive) throw new BadRequestException(`Um item da loja "${store.name}" não está disponível.`)
      if (product.storeId !== store.id) throw new BadRequestException('Um item não pertence à loja informada.')
      if (product.stock !== null && product.stock < item.quantity) throw new BadRequestException(`Produto "${product.name}" tem apenas ${product.stock} unidade(s) disponível(is).`)
      const productMaxKm = (product as any).maxDeliveryKm
      if (productMaxKm != null && productMaxKm > 0 && distToAddress > productMaxKm) {
        throw new BadRequestException(`"${product.name}" não pode ser entregue a ${distToAddress.toFixed(1)} km — limite deste produto é ${productMaxKm} km.`)
      }
      let unitPrice = Number(product.basePrice ?? 0)
      if (item.variationId) {
        const variation = product.variations.find((v) => v.id === item.variationId)
        if (!variation || !variation.isActive) throw new BadRequestException('Variação não disponível.')
        if (variation.stock !== null && variation.stock < item.quantity) throw new BadRequestException(`Variação "${variation.name}" tem apenas ${variation.stock} unidade(s) disponível(is).`)
        unitPrice = Number(variation.price)
        stockDecrements.push({ id: variation.id, type: 'variation', by: item.quantity })
      } else {
        if (product.stock !== null) stockDecrements.push({ id: product.id, type: 'product', by: item.quantity })
      }
      subtotal += unitPrice * item.quantity
      promoDiscount += promoDiscountFor(item.quantity, unitPrice, (product as any).promoBuyQty, (product as any).promoPayQty)
      orderItems.push({ productId: item.productId, variationId: item.variationId, quantity: item.quantity, unitPrice, notes: item.notes })
      mpItems.push({ id: item.productId, title: product.name, quantity: item.quantity, unit_price: unitPrice })
    }
    subtotal = Math.round(subtotal * 100) / 100
    promoDiscount = Math.round(promoDiscount * 100) / 100
    const deliveryFee = calcCourierFee(distToAddress)

    let couponDiscount = 0, couponId: string | undefined, couponMaxUses: number | null = null, couponFreeShipping = false
    if (group.couponCode) {
      // Cupom valida sobre o subtotal BRUTO (igual ao preview do checkout). O promo
      // entra como desconto independente somado depois — os dois acumulam.
      const result = await this.coupons.validate(group.couponCode, userId, subtotal, store.id)
      couponDiscount = result.discount
      couponId = result.coupon.id
      couponMaxUses = (result.coupon as any).maxUses ?? null
      couponFreeShipping = Boolean(result.freeShipping)
      // Cupom + promoção nunca podem passar do subtotal (senão o pedido zeraria/ficaria
      // negativo). Limita o cupom ao que sobra depois do desconto progressivo.
      couponDiscount = Math.min(couponDiscount, Math.max(0, subtotal - promoDiscount))
      couponDiscount = Math.round(couponDiscount * 100) / 100
    }

    return { store, subtotal, promoDiscount, deliveryFee, orderItems, mpItems, stockDecrements, couponDiscount, couponId, couponMaxUses, couponFreeShipping, loyaltyDiscount: 0 }
  }

  // ─── Checkout MULTI-LOJA: cria N pedidos (1 por loja) sob 1 pagamento único ───
  // Também atende 1 loja (groups.length === 1). Não mexe no create() legado.
  async createMulti(userId: string, dto: CreateOrderDto) {
    // Idempotência: devolve os pedidos do pagamento se a tentativa ainda estiver viva.
    if (dto.idempotencyKey) {
      const existing = await this.prisma.payment.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { orders: { include: { items: { include: { product: true, variation: true } }, payment: true, address: true, store: { select: { id: true, name: true, logoUrl: true } } } } },
      })
      if (existing?.orders?.length) {
        // Escopo por usuário: não devolver o pedido de outro cliente (PII + deliveryCode).
        if (existing.orders.some((o) => (o as any).userId !== userId)) throw new ForbiddenException()
        const dead = (existing as any).status === 'FAILED' || existing.orders.every((o) => o.status === 'CANCELLED')
        if (!dead) return { orders: existing.orders, payment: existing }
        throw new BadRequestException('A tentativa de pagamento anterior não foi concluída. Refaça o pedido.')
      }
    }

    const rawGroups = (dto.groups && dto.groups.length)
      ? dto.groups
      : (dto.storeId && dto.items ? [{ storeId: dto.storeId, items: dto.items, couponCode: dto.couponCode }] : [])
    if (!rawGroups.length) throw new BadRequestException('Carrinho vazio.')

    const payer = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, phone: true, createdAt: true, pushToken: true } })

    let scheduledDate: Date | undefined
    if (dto.scheduledFor) {
      scheduledDate = new Date(dto.scheduledFor)
      if (isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) throw new BadRequestException('O horário de agendamento deve ser uma data futura válida.')
    }

    const address = await this.prisma.address.findFirst({ where: { id: dto.addressId, userId } })
    if (!address) throw new NotFoundException('Address not found')

    const marketplaceOn = this.mpOauth.isEnabled()
    const multiStore = rawGroups.length > 1

    // Prepara todos os grupos (validação + preço) ANTES de qualquer escrita.
    const prepared: Awaited<ReturnType<typeof this.prepareStoreGroup>>[] = []
    for (const g of rawGroups) prepared.push(await this.prepareStoreGroup(userId, g, address, scheduledDate, marketplaceOn))

    // Fidelidade (global): distribui o desconto entre os grupos, proporcional ao (subtotal − cupom).
    let loyaltyRedeem = 0, loyaltyAccountId: string | undefined
    if (dto.pointsToRedeem && dto.pointsToRedeem > 0) {
      const pts = Math.floor(dto.pointsToRedeem)
      if (pts < 100 || pts % 100 !== 0) throw new BadRequestException('Resgate de pontos deve ser em múltiplos de 100 (mínimo 100).')
      const account = await this.prisma.loyaltyAccount.findUnique({ where: { userId } })
      if (!account || account.points < pts) throw new BadRequestException('Saldo de pontos insuficiente para o resgate.')
      const totalPayable = prepared.reduce((s, g) => s + Math.max(0, g.subtotal - g.couponDiscount - g.promoDiscount), 0)
      let desired = (pts / 100) * 10
      if (desired > totalPayable) {
        const usableBlocks = Math.floor(totalPayable / 10)
        loyaltyRedeem = usableBlocks * 100
        desired = usableBlocks * 10
      } else {
        loyaltyRedeem = pts
      }
      if (loyaltyRedeem > 0 && totalPayable > 0) {
        loyaltyAccountId = account.id
        let allocated = 0
        prepared.forEach((g, i) => {
          const gPayable = Math.max(0, g.subtotal - g.couponDiscount - g.promoDiscount)
          let share = i === prepared.length - 1
            ? Math.round((desired - allocated) * 100) / 100
            : Math.round(desired * (gPayable / totalPayable) * 100) / 100
          share = Math.min(share, gPayable)
          g.loyaltyDiscount = share
          allocated += share
        })
      }
    }

    // Totais por grupo + total geral (o pagamento único cobre o total).
    const deliveryCodes = prepared.map(() => String(randomInt(100000, 1000000)))
    const groupTotals = prepared.map((g) => {
      let discount = Math.round((g.couponDiscount + g.loyaltyDiscount + g.promoDiscount) * 100) / 100
      if (discount > g.subtotal) discount = g.subtotal
      const deliveryWaived = g.couponFreeShipping ? g.deliveryFee : 0
      const total = Math.round((g.subtotal + g.deliveryFee - discount - deliveryWaived) * 100) / 100
      return { discount, total }
    })
    const grandTotal = Math.round(groupTotals.reduce((s, t) => s + t.total, 0) * 100) / 100

    // Guarda: os descontos não podem zerar o pedido — o Mercado Pago não cobra R$0
    // (e a loja não pode "pagar" o cliente). Se o total ficou <= 0, barra com mensagem.
    if (grandTotal <= 0) {
      throw new BadRequestException('Os descontos deixaram o total em R$ 0,00. Remova um cupom ou promoção para continuar.')
    }

    // Split só faz sentido em loja única (não dá pra dividir 1 pagamento entre N vendedores).
    const paidViaSplit = !multiStore && marketplaceOn && ['PIX', 'CREDIT_CARD', 'DEBIT_CARD'].includes(dto.paymentMethod)

    const { payment, orders } = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: { method: dto.paymentMethod, amount: grandTotal, status: 'PENDING', idempotencyKey: dto.idempotencyKey },
      })
      const orders: any[] = []
      for (let i = 0; i < prepared.length; i++) {
        const g = prepared[i]
        const gt = groupTotals[i]
        const order = await tx.order.create({
          data: {
            userId, storeId: g.store.id, addressId: dto.addressId, paymentId: payment.id,
            couponId: g.couponId,
            subtotal: g.subtotal, deliveryFee: g.deliveryFee, discount: gt.discount,
            couponDiscount: g.couponDiscount, loyaltyDiscount: g.loyaltyDiscount,
            promoDiscount: g.promoDiscount,
            freeShipping: g.couponFreeShipping, total: gt.total,
            notes: dto.notes, scheduledFor: scheduledDate, deliveryCode: deliveryCodes[i],
            paidViaSplit,
            items: { create: g.orderItems },
          },
          include: { items: { include: { product: true, variation: true } }, payment: true, address: true, store: { select: { id: true, name: true, logoUrl: true } } },
        })
        await tx.orderStatusHistory.create({ data: { orderId: order.id, status: 'PENDING', changedBy: userId, note: 'Pedido criado' } })
        if (g.couponId) {
          await tx.couponUse.create({ data: { couponId: g.couponId, userId, orderId: order.id } })
          const upd = await tx.coupon.updateMany({
            where: g.couponMaxUses != null ? { id: g.couponId, usedCount: { lt: g.couponMaxUses } } : { id: g.couponId },
            data: { usedCount: { increment: 1 } },
          })
          if (upd.count === 0) throw new BadRequestException('Um dos cupons atingiu o limite de usos.')
        }
        for (const { id, type, by } of g.stockDecrements) {
          const res = type === 'variation'
            ? await tx.productVariation.updateMany({ where: { id, stock: { gte: by } }, data: { stock: { decrement: by } } })
            : await tx.product.updateMany({ where: { id, stock: { gte: by } }, data: { stock: { decrement: by } } })
          if (res.count === 0) throw new BadRequestException('Estoque insuficiente para um dos itens. Revise seu carrinho.')
        }
        orders.push(order)
      }
      // Fidelidade (global): decremento atômico + ledger (referencia o 1º pedido).
      if (loyaltyAccountId && loyaltyRedeem > 0) {
        const res = await tx.loyaltyAccount.updateMany({ where: { id: loyaltyAccountId, points: { gte: loyaltyRedeem } }, data: { points: { decrement: loyaltyRedeem } } })
        if (res.count === 0) throw new BadRequestException('Saldo de pontos insuficiente para o resgate.')
        await tx.loyaltyTransaction.create({
          data: { accountId: loyaltyAccountId, points: -loyaltyRedeem, type: 'REDEEM', description: `Resgate de ${loyaltyRedeem} pontos (R$ ${((loyaltyRedeem / 100) * 10).toFixed(2)} de desconto)`, orderId: orders[0].id },
        })
      }
      return { payment, orders }
    })

    const firstOrder = orders[0]
    const allMpItems = prepared.flatMap((g) => g.mpItems)

    let splitOpts: { sellerToken?: string | null; applicationFee?: number } | undefined
    if (!multiStore && marketplaceOn) {
      const g = prepared[0]
      const sellerToken = await this.mpOauth.getValidSellerToken(g.store as any)
      const platformCommission = Math.round(g.subtotal * 0.10 * 100) / 100
      const rawFee = platformCommission + g.deliveryFee - g.loyaltyDiscount
      const applicationFee = Math.max(0, Math.min(Math.round(rawFee * 100) / 100, grandTotal))
      splitOpts = { sellerToken, applicationFee }
    }

    const cancelAll = async () => {
      await this.prisma.order.updateMany({ where: { paymentId: payment.id }, data: { status: 'CANCELLED' } }).catch(() => {})
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } }).catch(() => {})
      for (const o of orders) await this.restoreOrderConsumption(o.id)
    }

    let paymentOut: any = payment

    if (dto.paymentMethod === 'PIX') {
      try {
        const pixResult = await this.payments.createPixPayment(payment.id, grandTotal, firstOrder.id, safePayerEmail(payer?.email), splitOpts)
        if (pixResult.splitFellBack) await this.prisma.order.updateMany({ where: { paymentId: payment.id }, data: { paidViaSplit: false } }).catch(() => {})
        paymentOut = { ...payment, gatewayId: pixResult.gatewayId, pixCode: pixResult.pixCode, pixQrBase64: pixResult.pixQrBase64, pixExpiresAt: new Date(Date.now() + 30 * 60 * 1000) }
        orders.forEach((o) => { if (o.payment) Object.assign(o.payment, paymentOut) })
      } catch (err: any) {
        this.logger.error('PIX (multi) creation failed after orders were saved', err)
        await cancelAll()
        const raw = typeof err?.message === 'string' ? err.message : ''
        const semChavePix = /without key enabled for QR|key enabled|sem chave|no pix key/i.test(raw)
        throw new BadRequestException(semChavePix ? 'Esta loja ainda não habilitou o PIX na conta de pagamento. Pague com cartão ou tente novamente mais tarde.' : 'Não foi possível gerar o QR Code PIX agora. Tente pagar com cartão.')
      }
    }

    if (['CREDIT_CARD', 'DEBIT_CARD'].includes(dto.paymentMethod) && dto.cardToken) {
      try {
        const nameParts = (payer?.name ?? '').trim().split(/\s+/).filter(Boolean)
        const result = await this.payments.createCardPayment(payment.id, grandTotal, firstOrder.id, dto.cardToken, dto.installments ?? 1, safePayerEmail(payer?.email), dto.payerCpf, {
          ...splitOpts,
          payerFirstName: nameParts[0],
          payerLastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined,
          payerPhone: (payer?.phone ?? '').replace(/\D/g, '') || undefined,
          payerRegDate: payer?.createdAt ? payer.createdAt.toISOString() : undefined,
          items: allMpItems,
          deviceId: dto.deviceId,
          payerAddress: { zip_code: address.zipCode?.replace(/\D/g, ''), street_name: address.street, street_number: address.number },
        })
        if (result.splitFellBack) await this.prisma.order.updateMany({ where: { paymentId: payment.id }, data: { paidViaSplit: false } }).catch(() => {})
        if (result.status === 'PAID') {
          await this.prisma.order.updateMany({ where: { paymentId: payment.id }, data: { status: 'CONFIRMED' } })
          orders.forEach((o) => { o.status = 'CONFIRMED' })
          // Cliente: 1 confirmação de pagamento (as lojas recebem "🛒 Novo pedido!"
          // abaixo — não duplica com "Pedido pago" por loja).
          if (payer?.pushToken) {
            this.push.send(payer.pushToken, '✅ Pagamento confirmado!', 'Seu pedido foi pago e já está sendo preparado.', { orderId: firstOrder.id })
          }
          this.notifications.create(userId, 'PAYMENT', '✅ Pagamento confirmado!', `Pagamento de R$ ${grandTotal.toFixed(2)} confirmado.`, { orderId: firstOrder.id })
            .catch((e) => this.logger.warn('Buyer notification failed', e))
        } else if (result.status === 'FAILED') {
          await cancelAll()
          throw new BadRequestException(`Pagamento recusado. Motivo: ${result.statusDetail ?? 'cartão não autorizado'}. Verifique os dados e tente novamente.`)
        }
      } catch (err: any) {
        if (err instanceof HttpException) throw err
        this.logger.error('Card (multi) payment failed', err)
        await cancelAll()
        const cause = Array.isArray(err?.cause) ? err.cause.map((c: any) => c?.description).filter(Boolean).join('; ') : ''
        const raw = (cause || err?.message || '').toString().slice(0, 160)
        throw new BadRequestException(`Não foi possível processar o pagamento com cartão${raw ? ` (${raw})` : ''}. Verifique os dados ou pague com PIX.`)
      }
    }

    // Notifica cada loja do novo pedido (aviso ÚNICO — PIX fica PENDING, cartão já CONFIRMED).
    for (const g of prepared) {
      const o = orders.find((x) => x.storeId === g.store.id)!
      if (g.store.user?.pushToken) this.push.send(g.store.user.pushToken, '🛒 Novo pedido!', 'Você recebeu um novo pedido. Toque para ver.', { orderId: o.id })
      this.notifications.create(g.store.user.id, 'ORDER_UPDATE', '🛒 Novo pedido!', `Pedido #${o.id.slice(0, 8)} · R$ ${Number(o.total).toFixed(2)}`, { orderId: o.id }).catch((e) => this.logger.warn('Store notification failed', e))
    }

    return { orders, payment: paymentOut }
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

    const orders = await this.prisma.order.findMany({
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
    // O código de entrega é segredo do cliente — nunca expor ao lojista (anti-fraude),
    // senão poderia repassá-lo a um entregador cúmplice para finalizar sem entregar.
    for (const o of orders) (o as any).deliveryCode = null
    return orders
  }

  async findById(id: string, userId: string, userRole: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        // NUNCA expor a loja inteira aqui: cliente/entregador recebem este pedido.
        // Só campos de exibição (+ userId p/ a checagem de dono, removido no fim).
        store: { select: { id: true, name: true, logoUrl: true, phone: true, address: true, lat: true, lng: true, isOpen: true, prepTimeMin: true, userId: true } },
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

    // O código de entrega SÓ pode ser visto pelo cliente dono (e admin). Se o
    // entregador ou a loja pudessem lê-lo, a proteção anti-fraude não valeria nada.
    if (!isOwner && !isAdmin) {
      ;(order as any).deliveryCode = null
    }

    // userId da loja só serviu pra checagem de dono acima — não vai pro cliente.
    if ((order as any).store) delete (order as any).store.userId

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

    // Máquina de estados: a LOJA só avança PENDING→CONFIRMED→PREPARING→READY.
    // PICKED_UP/DELIVERED são exclusivos do fluxo do entregador; regressões são barradas.
    // (Cancelamento é por outro endpoint: cancelByStore.)
    const STORE_ALLOWED: Record<string, OrderStatus[]> = {
      PENDING: ['CONFIRMED'],
      CONFIRMED: ['PREPARING'],
      PREPARING: ['READY'],
    }
    if (!STORE_ALLOWED[order.status]?.includes(status)) {
      throw new BadRequestException('Transição de status não permitida.')
    }

    // A loja não pode preparar/despachar um pedido que ainda não foi pago
    // (ex.: PIX gerado e nunca pago).
    if (order.payment?.status !== 'PAID') {
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

  // Reversão de estoque/cupom/pontos vive no OrderConsumptionService (reutilizado
  // pelo webhook de pagamento sem dependência circular). Wrapper mantém os call sites.
  private async restoreOrderConsumption(orderId: string) {
    return this.orderConsumption.restoreOrderConsumption(orderId)
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

    // Estorna o pagamento se já foi pago (idempotente; lança se o MP recusar,
    // abortando o cancelamento — nunca marcamos CANCELLED sem devolver o dinheiro).
    await this.payments.refundPayment(orderId)

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    })
    await this.restoreOrderConsumption(orderId)

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
        delivery: { select: { id: true, status: true } },
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

    // Estorna o pagamento se já foi pago (idempotente; lança se o MP recusar).
    await this.payments.refundPayment(orderId)

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', refusalNote: note },
    })
    await this.restoreOrderConsumption(orderId)

    // Encerra a entrega/busca pendente (o pedido foi cancelado antes da coleta) —
    // senão o matching continua oferecendo e um entregador aceita pedido cancelado.
    if ((order as any).delivery?.id) {
      await this.prisma.delivery.update({
        where: { id: (order as any).delivery.id },
        data: { status: 'FAILED' as any },
      }).catch(() => {})
      this.matching?.cancelMatching((order as any).delivery.id)
    }

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
