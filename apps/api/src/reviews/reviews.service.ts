import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateReviewDto } from './dto/create-review.dto'

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateReviewDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: { id: true, userId: true, storeId: true, status: true },
    })

    if (!order) throw new NotFoundException('Pedido não encontrado')
    if (order.userId !== userId) throw new BadRequestException('Este pedido não pertence a você')
    if (order.status !== 'DELIVERED') throw new BadRequestException('Só é possível avaliar pedidos entregues')

    const existing = await this.prisma.review.findUnique({ where: { orderId: dto.orderId } })
    if (existing) throw new ConflictException('Este pedido já foi avaliado')

    const review = await this.prisma.review.create({
      data: {
        userId,
        storeId: order.storeId,
        orderId: dto.orderId,
        rating: dto.rating,
        comment: dto.comment,
        photos: dto.photos ?? [],
      },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    })

    await this.recomputeStoreRating(order.storeId)
    return review
  }

  /** Recalcula e persiste a nota média + quantidade de reviews da loja (alimenta filtro/ordenação). */
  private async recomputeStoreRating(storeId: string) {
    const agg = await this.prisma.review.aggregate({
      where: { storeId },
      _avg: { rating: true },
      _count: true,
    })
    await this.prisma.store.update({
      where: { id: storeId },
      data: {
        rating: agg._avg.rating != null ? Math.round(agg._avg.rating * 100) / 100 : null,
        reviewCount: agg._count,
      },
    }).catch(() => {})
  }

  async findByStore(storeId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit
    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { storeId },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.review.count({ where: { storeId } }),
    ])

    const avgRating = total > 0
      ? await this.prisma.review.aggregate({ where: { storeId }, _avg: { rating: true } })
      : null

    return {
      reviews,
      total,
      page,
      pages: Math.ceil(total / limit),
      avgRating: avgRating?._avg?.rating ?? null,
    }
  }

  async checkReviewed(userId: string, orderId: string) {
    const review = await this.prisma.review.findUnique({ where: { orderId } })
    return { reviewed: !!review && review.userId === userId }
  }
}
