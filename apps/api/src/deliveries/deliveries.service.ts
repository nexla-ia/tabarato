import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const COURIER_INCLUDE = {
  courier: { include: { user: { select: { name: true, phone: true } } } },
}

@Injectable()
export class DeliveriesService {
  constructor(private prisma: PrismaService) {}

  async assign(userId: string, orderId: string, courierId: string) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new ForbiddenException()

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId: store.id, status: 'READY' },
    })
    if (!order) throw new NotFoundException('Pedido não encontrado ou não está pronto')

    const courier = await this.prisma.courier.findUnique({ where: { id: courierId } })
    if (!courier) throw new NotFoundException('Entregador não encontrado')

    const existing = await this.prisma.delivery.findUnique({ where: { orderId } })
    if (existing) throw new ConflictException('Entregador já atribuído a este pedido')

    return this.prisma.delivery.create({
      data: { orderId, courierId, distanceKm: 0, courierFee: 0, status: 'COURIER_ASSIGNED' },
      include: COURIER_INCLUDE,
    })
  }

  async getByOrder(userId: string, orderId: string) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new ForbiddenException()

    const order = await this.prisma.order.findFirst({ where: { id: orderId, storeId: store.id } })
    if (!order) throw new NotFoundException('Order not found')

    return this.prisma.delivery.findUnique({ where: { orderId }, include: COURIER_INCLUDE })
  }
}
