import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
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

    return this.prisma.delivery.findMany({
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
  }

  async findAvailableDeliveries() {
    return this.prisma.delivery.findMany({
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
    await this.wallet.debit(courier.id, 'COURIER', amount, `Saque via PIX (${courier.pixKey})`, `saque-${crypto.randomUUID()}`)
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

  async advanceDelivery(userId: string, deliveryId: string, photoUrl?: string) {
    const courier = await this.prisma.courier.findUnique({ where: { userId } })
    if (!courier) throw new NotFoundException('Courier not found')

    const delivery = await this.prisma.delivery.findFirst({
      where: { id: deliveryId, courierId: courier.id },
      include: {
        order: {
          include: {
            user: { select: { id: true, pushToken: true } },
            store: { include: { user: { select: { id: true, pushToken: true } } } },
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
          subtotal: true, couponDiscount: true, storeId: true,
          store: { select: { mpConnected: true } },
          payment: { select: { status: true } },
        },
      })
      if (!fullOrder) throw new NotFoundException('Order not found')

      // CLAIM ATÔMICO: só UM chamador move o status atual -> DELIVERED. Evita
      // double-credit por chamadas concorrentes (duplo-tap, retry).
      const claim = await this.prisma.delivery.updateMany({
        where: { id: deliveryId, status: fromStatus },
        data: updateData,
      })
      if (claim.count === 0) throw new ConflictException('Entrega já foi atualizada.')

      // Só movimenta dinheiro se o pedido foi realmente pago.
      const isPaid = fullOrder.payment?.status === 'PAID'
      const courierFee = Number(delivery.courierFee)
      const platformCommission = Math.round(Number(fullOrder.subtotal) * 0.10 * 100) / 100
      // Loja recebe: subtotal − cupom − comissão. Absorve o CUPOM (promo dela), mas NÃO
      // a fidelidade (bancada pela plataforma). Consistente com o cálculo do split.
      const storeAmount = Math.max(0, Math.round((Number(fullOrder.subtotal) - Number(fullOrder.couponDiscount) - platformCommission) * 100) / 100)
      const storePaidViaSplit = this.marketplaceOn && Boolean(fullOrder.store?.mpConnected)

      // Repasse ao entregador via MP (só após vencer o claim e se pago)
      const courierPaidViaMp = isPaid
        ? (await this.mpOauth.payoutCourier(courier as any, courierFee, delivery.orderId)).done
        : false

      await this.prisma.$transaction(async (tx) => {
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
        if (ord) this.loyalty.earnPoints(ord.userId, delivery.orderId, Number(fullOrder.subtotal)).catch(() => {})
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
      DELIVERED:        { title: '🎉 Pedido entregue!',   body: 'Aproveite! Não esqueça de avaliar o entregador.' },
    }
    const msg = pushMessages[nextStatus]
    const pushToken = delivery.order.user?.pushToken
    if (msg && pushToken) {
      this.push.send(pushToken, msg.title, msg.body, { orderId: delivery.orderId })
    }
    if (msg) {
      this.notifications.create(delivery.order.user.id, 'DELIVERY_UPDATE', msg.title, msg.body, { orderId: delivery.orderId }).catch((err) => {
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
}
