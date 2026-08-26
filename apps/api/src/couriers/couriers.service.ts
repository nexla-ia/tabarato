import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { ConfigService } from '@nestjs/config'
import { DeliveryStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../common/push.service'
import { WalletService } from '../wallet/wallet.service'
import { NotificationsService } from '../notifications/notifications.service'
import { LoyaltyService } from '../loyalty/loyalty.service'
import { MpOauthService } from '../payments/mp-oauth.service'
import { DeliveryMatchingService } from './delivery-matching.service'
import { DeliveryGateway } from './delivery.gateway'
import { CreateCourierDto } from './dto/create-courier.dto'
import { UpdateLocationDto } from './dto/update-location.dto'

/** Distância em metros entre dois pontos (Haversine). */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // raio da Terra em metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

@Injectable()
export class CouriersService {
  private readonly logger = new Logger(CouriersService.name)

  constructor(
    private prisma: PrismaService,
    private push: PushService,
    private wallet: WalletService,
    private notifications: NotificationsService,
    private loyalty: LoyaltyService,
    private config: ConfigService,
    private mpOauth: MpOauthService,
    @Optional() private matching: DeliveryMatchingService,
    @Optional() private gateway: DeliveryGateway,
  ) {}

  /**
   * Raio (em metros) da cerca geográfica para confirmar entrega. O entregador
   * precisa estar a até esse raio do endereço do cliente para finalizar.
   * Default 300m. Defina DELIVERY_GEOFENCE_METERS=0 para desativar.
   */
  private get geofenceMeters(): number {
    const raw = this.config.get<string>('DELIVERY_GEOFENCE_METERS')
    if (raw === undefined || raw === '') return 300
    const v = Number(raw)
    return Number.isFinite(v) && v > 0 ? v : 0
  }

  /** Marketplace ativo (split) quando as credenciais MP existem. */
  private get marketplaceOn(): boolean {
    return Boolean(
      this.config.get<string>('MERCADO_PAGO_CLIENT_ID') &&
      this.config.get<string>('MERCADO_PAGO_CLIENT_SECRET') &&
      this.config.get<string>('MERCADO_PAGO_REDIRECT_URI'),
    )
  }

  async register(userId: string, dto: CreateCourierDto) {
    const existing = await this.prisma.courier.findUnique({ where: { userId } })
    if (existing) throw new ConflictException('User already registered as courier')

    return this.prisma.courier.create({
      data: { ...dto, userId },
    })
  }

  async findMe(userId: string) {
    const courier = await this.prisma.courier.findUnique({
      where: { userId },
      include: { user: { select: { name: true, email: true, phone: true } } },
    })
    if (!courier) throw new NotFoundException('Courier profile not found')
    return courier
  }

  async updateLocation(userId: string, dto: UpdateLocationDto) {
    const courier = await this.prisma.courier.findUnique({ where: { userId } })
    if (!courier) throw new NotFoundException('Courier profile not found')

    const updated = await this.prisma.courier.update({
      where: { id: courier.id },
      data: { currentLat: dto.lat, currentLng: dto.lng },
      select: { id: true, currentLat: true, currentLng: true, updatedAt: true },
    })

    // Broadcast live position to consumers watching this courier's active delivery
    if (this.gateway) {
      const activeDelivery = await this.prisma.delivery.findFirst({
        where: {
          courierId: courier.id,
          status: { notIn: ['SEARCHING_COURIER', 'DELIVERED', 'FAILED'] },
        },
        select: { orderId: true },
      })
      if (activeDelivery) {
        this.gateway.broadcastPosition(activeDelivery.orderId, dto.lat, dto.lng)
      }
    }

    return updated
  }

  async toggleOnline(userId: string) {
    const courier = await this.prisma.courier.findUnique({ where: { userId } })
    if (!courier) throw new NotFoundException('Courier profile not found')

    return this.prisma.courier.update({
      where: { id: courier.id },
      data: { isOnline: !courier.isOnline },
      select: { id: true, isOnline: true },
    })
  }

  async findAvailable() {
    return this.prisma.courier.findMany({
      where: { isOnline: true, status: 'APPROVED' },
      include: { user: { select: { name: true, phone: true } } },
    })
  }

  async findMyDeliveries(userId: string) {
    const courier = await this.prisma.courier.findUnique({ where: { userId } })
    if (!courier) throw new NotFoundException('Courier profile not found')

    const deliveries = await this.prisma.delivery.findMany({
      where: {
        courierId: courier.id,
        status: { notIn: ['SEARCHING_COURIER', 'DELIVERED', 'FAILED'] },
      },
      include: {
        order: {
          include: {
            store: { select: { name: true, lat: true, lng: true } },
            address: { select: { street: true, number: true, district: true, lat: true, lng: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    // Nunca expor o código de entrega ao entregador (anti-fraude).
    for (const d of deliveries) if ((d as any).order) (d as any).order.deliveryCode = null
    return deliveries
  }

  async findAvailableDeliveries(userId: string) {
    // Só entregador APROVADO pode ver entregas disponíveis (elas expõem endereço
    // do cliente — PII). Um cadastro PENDING/suspenso não deve enumerar isso.
    const courier = await this.prisma.courier.findUnique({ where: { userId } })
    if (!courier) throw new NotFoundException('Courier profile not found')
    if (courier.status !== 'APPROVED') return []

    const deliveries = await this.prisma.delivery.findMany({
      where: { courierId: null, status: 'SEARCHING_COURIER' },
      include: {
        order: {
          include: {
            store: { select: { name: true, lat: true, lng: true } },
            address: { select: { street: true, number: true, district: true, lat: true, lng: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    for (const d of deliveries) if ((d as any).order) (d as any).order.deliveryCode = null
    return deliveries
  }

  async acceptDelivery(userId: string, deliveryId: string) {
    const courier = await this.prisma.courier.findUnique({ where: { userId } })
    if (!courier) throw new NotFoundException('Courier not found')
    // Entregador suspenso/pendente não pode aceitar entregas
    if (courier.status !== 'APPROVED') {
      throw new ForbiddenException('Sua conta de entregador ainda não está aprovada.')
    }

    // Atomic update: only succeeds if delivery is still unassigned (prevents TOCTOU race)
    const result = await this.prisma.delivery.updateMany({
      where: { id: deliveryId, courierId: null, status: 'SEARCHING_COURIER' },
      data: { courierId: courier.id, status: 'COURIER_HEADING_TO_STORE' },
    })

    if (result.count === 0) {
      throw new ConflictException('Esta entrega já foi aceita por outro entregador.')
    }

    // Cancel auto-match timer — delivery is taken
    this.matching?.cancelMatching(deliveryId)

    return this.prisma.delivery.findUnique({ where: { id: deliveryId } })
  }

  async findWallet(userId: string) {
    const courier = await this.prisma.courier.findUnique({ where: { userId } })
    if (!courier) throw new NotFoundException('Courier profile not found')
    return this.wallet.findByOwner(courier.id, 'COURIER')
  }

  /** Stats da home do entregador: entregas e ganhos de hoje + avaliação. */
  async getStats(userId: string) {
    const courier = await this.prisma.courier.findUnique({ where: { userId } })
    if (!courier) throw new NotFoundException('Courier profile not found')

    const start = new Date(); start.setHours(0, 0, 0, 0)
    const today = await this.prisma.delivery.findMany({
      where: { courierId: courier.id, status: 'DELIVERED', deliveredAt: { gte: start } },
      select: { courierFee: true },
    })
    const todayCount = today.length
    const todayEarnings = today.reduce((s, d) => s + Number(d.courierFee), 0)
    return { todayCount, todayEarnings, rating: courier.rating }
  }

  async findDeliveryHistory(userId: string) {
    const courier = await this.prisma.courier.findUnique({ where: { userId } })
    if (!courier) throw new NotFoundException('Courier profile not found')

    return this.prisma.delivery.findMany({
      where: { courierId: courier.id, status: 'DELIVERED' },
      include: {
        order: {
          include: {
            store: { select: { name: true } },
            address: { select: { street: true, number: true, district: true, city: true } },
          },
        },
      },
      orderBy: { deliveredAt: 'desc' },
    })
  }

  async requestWithdrawal(userId: string, amount: number) {
    const courier = await this.prisma.courier.findUnique({ where: { userId } })
    if (!courier) throw new NotFoundException('Courier not found')
    if (!courier.pixKey) throw new BadRequestException('Cadastre sua chave PIX antes de solicitar o saque.')
    // O débito cria um lançamento DEBIT no ledger (referenceId = saque-<uuid>),
    // que serve de registro auditável do saque até o repasse PIX manual.
    await this.wallet.debit(courier.id, 'COURIER', amount, `Saque via PIX (${courier.pixKey})`, `saque-${randomUUID()}`)
    return { message: 'Saque solicitado! O valor será enviado via PIX para a chave cadastrada.' }
  }

  /** Cadastra/atualiza a chave PIX do entregador (pra receber os saques). */
  async updatePixKey(userId: string, pixKey: string) {
    const courier = await this.prisma.courier.findUnique({ where: { userId } })
    if (!courier) throw new NotFoundException('Courier not found')
    const key = (pixKey ?? '').trim()
    if (!key) throw new BadRequestException('Informe uma chave PIX válida.')
    await this.prisma.courier.update({ where: { id: courier.id }, data: { pixKey: key } })
    return { pixKey: key }
  }

  async returnDelivery(userId: string, deliveryId: string) {
    const courier = await this.prisma.courier.findUnique({ where: { userId } })
    if (!courier) throw new NotFoundException('Courier not found')

    const delivery = await this.prisma.delivery.findFirst({
      where: { id: deliveryId, courierId: courier.id },
    })
    if (!delivery) throw new NotFoundException('Delivery not found')

    const returnable = ['COURIER_HEADING_TO_STORE', 'COURIER_AT_STORE']
    if (!returnable.includes(delivery.status)) {
      throw new BadRequestException('Não é possível devolver após coletar o pedido.')
    }

    const updated = await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { courierId: null, status: 'SEARCHING_COURIER' },
    })

    // Reinicia a busca por entregador — antes a entrega devolvida ficava "silenciosa"
    // (nenhum push a outros entregadores) até reiniciar o servidor.
    const order = await this.prisma.order.findUnique({
      where: { id: delivery.orderId },
      select: { store: { select: { lat: true, lng: true } } },
    })
    if (order?.store) {
      this.matching?.startMatching(deliveryId, order.store.lat, order.store.lng)
        .catch((err) => this.logger.warn('Re-match after return failed', err))
    }

    return updated
  }

  async advanceDelivery(userId: string, deliveryId: string, photoUrl?: string, code?: string, lat?: number, lng?: number) {
    const courier = await this.prisma.courier.findUnique({ where: { userId } })
    if (!courier) throw new NotFoundException('Courier not found')

    const delivery = await this.prisma.delivery.findFirst({
      where: { id: deliveryId, courierId: courier.id },
      include: {
        order: {
          include: {
            user: { select: { id: true, pushToken: true } },
            store: { include: { user: { select: { id: true, pushToken: true } } } },
            address: { select: { lat: true, lng: true } },
          },
        },
      },
    })
    if (!delivery) throw new NotFoundException('Delivery not found')

    const transitions: Partial<Record<DeliveryStatus, DeliveryStatus>> = {
      COURIER_ASSIGNED: 'COURIER_HEADING_TO_STORE', // atribuição manual pela loja
      COURIER_HEADING_TO_STORE: 'COURIER_AT_STORE',
      COURIER_AT_STORE: 'PICKED_UP',
      PICKED_UP: 'DELIVERED',
      HEADING_TO_CLIENT: 'DELIVERED',
    }

    const nextStatus = transitions[delivery.status]
    if (!nextStatus) throw new BadRequestException('Cannot advance from current delivery status')

    // ANTI-FRAUDE: para finalizar (→ DELIVERED) o entregador precisa informar o
    // código de 4 dígitos que o CLIENTE vê no app. Sem o código correto, não
    // finaliza e não recebe. Impede "marcar entregue" sem entregar de fato.
    if (nextStatus === 'DELIVERED') {
      const expected = (delivery as any).order?.deliveryCode as string | null | undefined
      // Só exige código quando o pedido tem um (pedidos antigos sem código ficam liberados).
      if (expected) {
        const attempts = (delivery as any).order?.deliveryCodeAttempts ?? 0
        // Bloqueio anti-brute-force: após 5 tentativas erradas, trava o código.
        if (attempts >= 5) {
          throw new BadRequestException('Muitas tentativas de código incorreto. Contate o suporte para concluir a entrega.')
        }
        const provided = (code ?? '').trim()
        if (!provided) throw new BadRequestException('Informe o código de entrega do cliente.')
        if (provided !== expected) {
          await this.prisma.order.update({
            where: { id: delivery.orderId }, data: { deliveryCodeAttempts: { increment: 1 } },
          }).catch(() => {})
          const left = Math.max(0, 5 - (attempts + 1))
          throw new BadRequestException(`Código de entrega incorreto.${left > 0 ? ` ${left} tentativa(s) restante(s).` : ''}`)
        }
      }

      // ANTI-FRAUDE (cerca geográfica): o entregador precisa estar fisicamente
      // próximo ao endereço do cliente para finalizar. Impede marcar "entregue"
      // longe do local. Só aplica se houver coords do endereço e a cerca estiver ativa.
      const radius = this.geofenceMeters
      const addr = (delivery as any).order?.address as { lat: number | null; lng: number | null } | undefined
      if (radius > 0 && addr?.lat != null && addr?.lng != null) {
        if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new BadRequestException('Ative a localização para confirmar a entrega no endereço do cliente.')
        }
        const dist = distanceMeters(lat, lng, Number(addr.lat), Number(addr.lng))
        if (dist > radius) {
          throw new BadRequestException(
            `Você está a ${Math.round(dist)}m do endereço. Aproxime-se do cliente para confirmar a entrega.`,
          )
        }
      }
    }

    const updateData: Record<string, any> = { status: nextStatus }
    if (nextStatus === 'PICKED_UP') updateData.pickedUpAt = new Date()
    if (nextStatus === 'DELIVERED') {
      updateData.deliveredAt = new Date()
      if (photoUrl) updateData.photoUrl = photoUrl
    }

    const fromStatus = delivery.status
    let updated: any = null

    if (nextStatus === 'DELIVERED') {
      const fullOrder = await this.prisma.order.findUnique({
        where: { id: delivery.orderId },
        select: {
          subtotal: true, couponDiscount: true, promoDiscount: true, storeId: true, paidViaSplit: true,
          freeShipping: true, deliveryFee: true,
          payment: { select: { status: true } },
        },
      })
      if (!fullOrder) throw new NotFoundException('Order not found')

      // Só movimenta dinheiro se o pedido foi realmente pago.
      const isPaid = fullOrder.payment?.status === 'PAID'
      const courierFee = Number(delivery.courierFee)
      const platformCommission = Math.round(Number(fullOrder.subtotal) * 0.10 * 100) / 100
      // Cupom de frete grátis: a LOJA absorve a entrega → desconta do repasse dela
      // (o entregador continua recebendo a taxa normalmente, paga pela plataforma).
      const storeDeliveryAbsorbed = fullOrder.freeShipping ? Number(fullOrder.deliveryFee) : 0
      // Loja recebe: subtotal − cupom − promoção − comissão − (frete, se frete grátis).
      // Absorve o CUPOM e a PROMOÇÃO "Leve X Pague Y" (ofertas dela), mas NÃO a
      // fidelidade (bancada pela plataforma).
      const storeAmount = Math.max(0, Math.round((Number(fullOrder.subtotal) - Number(fullOrder.couponDiscount) - Number((fullOrder as any).promoDiscount ?? 0) - platformCommission - storeDeliveryAbsorbed) * 100) / 100)
      // Fonte da verdade: a flag gravada no pedido no momento da cobrança (não o
      // mpConnected atual, que pode ter mudado após o split → evita pagar a loja 2x).
      const storePaidViaSplit = fullOrder.paidViaSplit

      // Repasse ao entregador via MP (externo; atualmente no-op/flag-guarded, cai na
      // carteira). DEVE ser idempotente por orderId quando o endpoint 1:N do MP entrar,
      // pois roda antes do commit da transação abaixo.
      const courierPaidViaMp = isPaid
        ? (await this.mpOauth.payoutCourier(courier as any, courierFee, delivery.orderId)).done
        : false

      // H5: claim + status DELIVERED + créditos num ÚNICO $transaction. Se qualquer
      // parte falhar, NADA é commitado (o status não vira DELIVERED) → o retry
      // reprocessa limpo, sem perder o crédito da loja/entregador.
      await this.prisma.$transaction(async (tx) => {
        // CLAIM ATÔMICO dentro da transação: só UM chamador move fromStatus -> DELIVERED
        // (barra double-credit por duplo-tap/retry concorrente).
        const claim = await tx.delivery.updateMany({
          where: { id: deliveryId, status: fromStatus },
          data: updateData,
        })
        if (claim.count === 0) throw new ConflictException('Entrega já foi atualizada.')

        await tx.order.update({ where: { id: delivery.orderId }, data: { status: 'DELIVERED' } })
        if (!isPaid) return // pedido não pago: não credita ninguém

        if (!courierPaidViaMp) {
          const courierWallet = await tx.wallet.upsert({
            where: { ownerId_ownerType: { ownerId: courier.id, ownerType: 'COURIER' } },
            update: {}, create: { ownerId: courier.id, ownerType: 'COURIER', balance: 0 },
          })
          await tx.wallet.update({ where: { id: courierWallet.id }, data: { balance: { increment: courierFee } } })
          await tx.transaction.create({
            data: { walletId: courierWallet.id, amount: courierFee, type: 'CREDIT',
              description: `Entrega #${delivery.orderId.slice(0, 8)}`, referenceId: delivery.id },
          })
        }

        if (!storePaidViaSplit && storeAmount > 0) {
          const storeWallet = await tx.wallet.upsert({
            where: { ownerId_ownerType: { ownerId: fullOrder.storeId, ownerType: 'STORE' } },
            update: {}, create: { ownerId: fullOrder.storeId, ownerType: 'STORE', balance: 0 },
          })
          await tx.wallet.update({ where: { id: storeWallet.id }, data: { balance: { increment: storeAmount } } })
          await tx.transaction.create({
            data: { walletId: storeWallet.id, amount: storeAmount, type: 'CREDIT',
              description: `Pedido #${delivery.orderId.slice(0, 8)}`, referenceId: delivery.orderId },
          })
        }
      })

      updated = await this.prisma.delivery.findUnique({ where: { id: deliveryId } })

      // Pontos de fidelidade ao consumidor (só se pago; fire-and-forget)
      if (isPaid) {
        const ord = await this.prisma.order.findUnique({ where: { id: delivery.orderId }, select: { userId: true } })
        if (ord) {
          this.loyalty.earnPoints(ord.userId, delivery.orderId, Number(fullOrder.subtotal)).catch(() => {})
          // Bônus de indicação: só no 1º pedido ENTREGUE do indicado (anti-farming).
          this.grantReferralIfFirstOrder(ord.userId).catch(() => {})
        }
      }
    } else {
      // Transição não-terminal — claim atômico também (evita avanço concorrente)
      const claim = await this.prisma.delivery.updateMany({
        where: { id: deliveryId, status: fromStatus },
        data: updateData,
      })
      if (claim.count === 0) throw new ConflictException('Entrega já foi atualizada.')
      updated = await this.prisma.delivery.findUnique({ where: { id: deliveryId } })
    }

    const pushMessages: Partial<Record<DeliveryStatus, { title: string; body: string }>> = {
      COURIER_AT_STORE: { title: '📍 Entregador na loja', body: 'O entregador chegou à loja e está coletando seu pedido.' },
      PICKED_UP:        { title: '🚴 Pedido a caminho!',  body: 'O entregador está vindo para você. Fique de olho!' },
      DELIVERED:        { title: '🎉 Pedido entregue!',   body: 'Aproveite! Avalie sua compra — dá pra anexar foto — e o entregador.' },
    }
    const msg = pushMessages[nextStatus]
    const pushToken = delivery.order.user?.pushToken
    if (msg && pushToken) {
      this.push.send(pushToken, msg.title, msg.body, { orderId: delivery.orderId })
    }
    if (msg) {
      // Entregue → a notificação abre a página do pedido já na seção de avaliação.
      const notifData: Record<string, unknown> = { orderId: delivery.orderId }
      if (nextStatus === 'DELIVERED') notifData.focus = 'avaliar'
      this.notifications.create(delivery.order.user.id, 'DELIVERY_UPDATE', msg.title, msg.body, notifData).catch((err) => {
        this.logger.warn('Failed to create delivery notification', err)
      })
    }

    // Notify store owner when courier picks up the order
    if (nextStatus === 'PICKED_UP') {
      const storeUser = (delivery.order as any).store?.user
      if (storeUser?.pushToken) {
        this.push.send(
          storeUser.pushToken,
          '🛵 Pedido coletado!',
          `Entregador ${courier.id.slice(0, 8)} coletou o pedido #${delivery.orderId.slice(-6).toUpperCase()}.`,
          { orderId: delivery.orderId },
        )
      }
      if (storeUser?.id) {
        this.notifications.create(storeUser.id, 'DELIVERY_UPDATE',
          '🛵 Pedido coletado!',
          `O entregador saiu com o pedido #${delivery.orderId.slice(-6).toUpperCase()}.`,
          { orderId: delivery.orderId },
        ).catch(() => {})
      }
    }

    return updated
  }

  /**
   * Bônus de indicação: pago só quando o INDICADO conclui o 1º pedido (entregue+pago).
   * Mata o farming de contas descartáveis que nunca compram. Claim atômico garante
   * uma única concessão por indicado, mesmo com entregas concorrentes.
   */
  private async grantReferralIfFirstOrder(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referredBy: true, referralRewarded: true },
    })
    if (!user?.referredBy || user.referralRewarded) return
    const claim = await this.prisma.user.updateMany({
      where: { id: userId, referralRewarded: false, referredBy: { not: null } },
      data: { referralRewarded: true },
    })
    if (claim.count === 0) return // outro processo já concedeu
    await this.loyalty.grantReferralBonus(user.referredBy, userId).catch(() => {})
  }
}
