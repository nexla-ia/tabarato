import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { DeliveryStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../common/push.service'
import { WalletService } from '../wallet/wallet.service'
import { NotificationsService } from '../notifications/notifications.service'
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
    @Optional() private matching: DeliveryMatchingService,
    @Optional() private gateway: DeliveryGateway,
  ) {}

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
    await this.wallet.debit(courier.id, 'COURIER', amount, 'Saque solicitado', `saque-${crypto.randomUUID()}`)
    return { message: 'Saque solicitado com sucesso. Será processado em até 24h via PIX.' }
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

    return this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { courierId: null, status: 'SEARCHING_COURIER' },
    })
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

    let updated: Awaited<ReturnType<typeof this.prisma.delivery.update>>

    if (nextStatus === 'DELIVERED') {
      // Fetch full order data needed for wallet credits
      const fullOrder = await this.prisma.order.findUnique({
        where: { id: delivery.orderId },
        select: { subtotal: true, storeId: true },
      })

      if (!fullOrder) throw new NotFoundException('Order not found')

      const platformFee = Math.round(Number(fullOrder.subtotal) * 0.10 * 100) / 100
      const storeAmount = Math.round((Number(fullOrder.subtotal) - platformFee) * 100) / 100
      const courierFee  = Number(delivery.courierFee)

      // Delivery update + order status + both wallet credits — all in one atomic transaction
      updated = await this.prisma.$transaction(async (tx) => {
        const d = await tx.delivery.update({ where: { id: deliveryId }, data: updateData })
        await tx.order.update({ where: { id: delivery.orderId }, data: { status: 'DELIVERED' } })

        // Courier wallet — get/create then credit
        const courierWallet = await tx.wallet.upsert({
          where: { ownerId_ownerType: { ownerId: courier.id, ownerType: 'COURIER' } },
          update: {},
          create: { ownerId: courier.id, ownerType: 'COURIER', balance: 0 },
        })
        await tx.wallet.update({ where: { id: courierWallet.id }, data: { balance: { increment: courierFee } } })
        await tx.transaction.create({
          data: { walletId: courierWallet.id, amount: courierFee, type: 'CREDIT',
            description: `Entrega #${delivery.orderId.slice(0, 8)}`, referenceId: delivery.id },
        })

        // Store wallet — get/create then credit
        const storeWallet = await tx.wallet.upsert({
          where: { ownerId_ownerType: { ownerId: fullOrder.storeId, ownerType: 'STORE' } },
          update: {},
          create: { ownerId: fullOrder.storeId, ownerType: 'STORE', balance: 0 },
        })
        await tx.wallet.update({ where: { id: storeWallet.id }, data: { balance: { increment: storeAmount } } })
        await tx.transaction.create({
          data: { walletId: storeWallet.id, amount: storeAmount, type: 'CREDIT',
            description: `Pedido #${delivery.orderId.slice(0, 8)}`, referenceId: delivery.orderId },
        })

        return d
      })
    } else {
      // For non-terminal transitions just update the delivery
      updated = await this.prisma.delivery.update({ where: { id: deliveryId }, data: updateData })
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
