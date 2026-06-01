import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DeliveryStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../common/push.service'
import { WalletService } from '../wallet/wallet.service'
import { NotificationsService } from '../notifications/notifications.service'
import { CreateCourierDto } from './dto/create-courier.dto'
import { UpdateLocationDto } from './dto/update-location.dto'

@Injectable()
export class CouriersService {
  constructor(
    private prisma: PrismaService,
    private push: PushService,
    private wallet: WalletService,
    private notifications: NotificationsService,
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

    return this.prisma.courier.update({
      where: { id: courier.id },
      data: { currentLat: dto.lat, currentLng: dto.lng },
      select: { id: true, currentLat: true, currentLng: true, updatedAt: true },
    })
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

    const delivery = await this.prisma.delivery.findFirst({
      where: { id: deliveryId, courierId: null, status: 'SEARCHING_COURIER' },
    })
    if (!delivery) throw new NotFoundException('Delivery not available')

    return this.prisma.delivery.update({
      where: { id: deliveryId },
      data: { courierId: courier.id, status: 'COURIER_HEADING_TO_STORE' },
    })
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
    await this.wallet.debit(courier.id, 'COURIER', amount, 'Saque solicitado', `saque-${Date.now()}`)
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
      include: { order: { include: { user: { select: { pushToken: true } } } } },
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

    const updated = await this.prisma.delivery.update({ where: { id: deliveryId }, data: updateData })

    if (nextStatus === 'DELIVERED') {
      await this.prisma.order.update({ where: { id: delivery.orderId }, data: { status: 'DELIVERED' } })

      // Credit courier wallet
      await this.wallet.credit(courier.id, 'COURIER', delivery.courierFee, `Entrega #${delivery.orderId.slice(0, 8)}`, delivery.id)

      // Credit store wallet: subtotal minus 10% platform fee
      const fullOrder = await this.prisma.order.findUnique({
        where: { id: delivery.orderId },
        select: { subtotal: true, storeId: true },
      })
      if (fullOrder) {
        const platformFee  = Math.round(fullOrder.subtotal * 0.10 * 100) / 100
        const storeAmount  = Math.round((fullOrder.subtotal - platformFee) * 100) / 100
        await this.wallet.credit(fullOrder.storeId, 'STORE', storeAmount, `Pedido #${delivery.orderId.slice(0, 8)}`, delivery.orderId)
      }
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
      this.notifications.create(delivery.order.userId, 'DELIVERY_UPDATE', msg.title, msg.body, { orderId: delivery.orderId }).catch(() => {})
    }

    return updated
  }
}
