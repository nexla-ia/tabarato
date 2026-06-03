import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

const POINTS_PER_REAL = 1       // 1 point per R$1 spent
const REDEEM_RATE = 10          // 100 points = R$10
const REFERRAL_BONUS = 50       // 50 points bonus for both referrer and referred

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name)

  constructor(private prisma: PrismaService) {}

  async getOrCreate(userId: string) {
    return this.prisma.loyaltyAccount.upsert({
      where: { userId },
      create: { userId, points: 0, lifetimePoints: 0 },
      update: {},
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    })
  }

  async earnPoints(userId: string, orderId: string, subtotal: number) {
    const points = Math.floor(subtotal * POINTS_PER_REAL)
    if (points <= 0) return

    const account = await this.getOrCreate(userId)
    await this.prisma.loyaltyAccount.update({
      where: { id: account.id },
      data: {
        points: { increment: points },
        lifetimePoints: { increment: points },
        transactions: {
          create: {
            points,
            type: 'EARN',
            description: `Pedido entregue (+${points} pontos)`,
            orderId,
          },
        },
      },
    })
    this.logger.log(`Loyalty: user ${userId.slice(0, 8)} earned ${points} pts for order ${orderId.slice(0, 8)}`)
  }

  async redeemPoints(userId: string, pointsToRedeem: number): Promise<number> {
    const account = await this.getOrCreate(userId)
    if (account.points < pointsToRedeem) throw new Error('Saldo de pontos insuficiente')

    const discount = (pointsToRedeem / 100) * REDEEM_RATE

    await this.prisma.loyaltyAccount.update({
      where: { id: account.id },
      data: {
        points: { decrement: pointsToRedeem },
        transactions: {
          create: {
            points: -pointsToRedeem,
            type: 'REDEEM',
            description: `Resgate de ${pointsToRedeem} pontos (R$ ${discount.toFixed(2)} de desconto)`,
          },
        },
      },
    })

    return discount
  }

  async grantReferralBonus(referrerId: string, newUserId: string) {
    await Promise.all([
      this.grantBonus(referrerId, REFERRAL_BONUS, `Bônus de indicação — amigo cadastrado`),
      this.grantBonus(newUserId, REFERRAL_BONUS, `Bônus de boas-vindas via indicação`),
    ])
  }

  private async grantBonus(userId: string, points: number, description: string) {
    const account = await this.getOrCreate(userId)
    await this.prisma.loyaltyAccount.update({
      where: { id: account.id },
      data: {
        points: { increment: points },
        lifetimePoints: { increment: points },
        transactions: {
          create: { points, type: 'BONUS', description },
        },
      },
    })
  }

  pointsToDiscount(points: number) {
    return (points / 100) * REDEEM_RATE
  }
}
