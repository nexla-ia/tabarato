import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const COURIER_INCLUDE = {
  courier: { include: { user: { select: { name: true, phone: true } } } },
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}
function calcCourierFee(distanceKm: number): number {
  return Math.round((10 + distanceKm * 2) * 100) / 100
}

@Injectable()
export class DeliveriesService {
  constructor(private prisma: PrismaService) {}

  async assign(userId: string, orderId: string, courierId: string) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new ForbiddenException()

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId: store.id, status: 'READY' },
      include: { address: { select: { lat: true, lng: true } } },
    })
    if (!order) throw new NotFoundException('Pedido não encontrado ou não está pronto')

    const courier = await this.prisma.courier.findUnique({ where: { id: courierId } })
    if (!courier) throw new NotFoundException('Entregador não encontrado')
    // Não permite atribuir a entregador não-aprovado (pendente/suspenso).
    if (courier.status !== 'APPROVED') {
      throw new ForbiddenException('Este entregador não está aprovado para receber entregas.')
    }

    const existing = await this.prisma.delivery.findUnique({ where: { orderId } })
    if (existing) throw new ConflictException('Entregador já atribuído a este pedido')

    // Calcula a distância e a taxa reais (antes ficava 0 — entregador não recebia)
    const distanceKm = haversineKm(store.lat, store.lng, order.address.lat, order.address.lng)
    const courierFee = calcCourierFee(distanceKm)

    try {
      return await this.prisma.delivery.create({
        data: {
          orderId, courierId,
          distanceKm: Math.round(distanceKm * 10) / 10,
          courierFee,
          status: 'COURIER_ASSIGNED',
        },
        include: COURIER_INCLUDE,
      })
    } catch (err: any) {
      // Corrida entre a checagem acima e o create (ou com o auto-match): a constraint
      // única de orderId barra a duplicata — devolve 409 no lugar de um 500 cru.
      if (err?.code === 'P2002') throw new ConflictException('Entregador já atribuído a este pedido')
      throw err
    }
  }

  async getByOrder(userId: string, orderId: string) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new ForbiddenException()

    const order = await this.prisma.order.findFirst({ where: { id: orderId, storeId: store.id } })
    if (!order) throw new NotFoundException('Order not found')

    return this.prisma.delivery.findUnique({ where: { orderId }, include: COURIER_INCLUDE })
  }
}
