import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class CourierReviewsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: { orderId: string; rating: number; comment?: string }) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: { id: true, userId: true, status: true, delivery: { select: { courierId: true } } },
    })
    if (!order) throw new NotFoundException('Pedido não encontrado')
    if (order.userId !== userId) throw new BadRequestException('Este pedido não pertence a você')
    if (order.status !== 'DELIVERED') throw new BadRequestException('Só é possível avaliar pedidos entregues')
    if (!order.delivery?.courierId) throw new BadRequestException('Este pedido não teve entregador')

    const existing = await this.prisma.courierReview.findUnique({ where: { orderId: dto.orderId } })
    if (existing) throw new ConflictException('Entregador já avaliado para este pedido')

    const courierId = order.delivery.courierId

    const review = await this.prisma.courierReview.create({
      data: { userId, courierId, orderId: dto.orderId, rating: dto.rating, comment: dto.comment },
    })

    const { _avg } = await this.prisma.courierReview.aggregate({
      where: { courierId },
      _avg: { rating: true },
    })
    await this.prisma.courier.update({
      where: { id: courierId },
      data: { rating: Math.round((_avg.rating ?? 5) * 10) / 10 },
    })

    return review
  }

  async checkReviewed(userId: string, orderId: string) {
    const review = await this.prisma.courierReview.findUnique({ where: { orderId } })
    return { reviewed: !!review && review.userId === userId }
  }
}
