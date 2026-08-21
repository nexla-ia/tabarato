import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Reversão do que um pedido "consumiu" na criação: estoque, uso de cupom e pontos
 * de fidelidade. Extraído do OrdersService pra ser reutilizado também pelo webhook
 * de pagamento (PaymentsService) SEM criar dependência circular entre os serviços.
 * Só depende do Prisma (stateless). O estorno de DINHEIRO é tratado à parte.
 */
@Injectable()
export class OrderConsumptionService {
  private readonly logger = new Logger(OrderConsumptionService.name)
  constructor(private prisma: PrismaService) {}

  /** Devolve ao estoque os itens de um pedido (só os que controlam estoque). */
  private async restoreStock(orderId: string) {
    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
      select: { productId: true, variationId: true, quantity: true },
    })
    for (const it of items) {
      if (it.variationId) {
        await this.prisma.productVariation.updateMany({
          where: { id: it.variationId }, data: { stock: { increment: it.quantity } },
        }).catch(() => {})
      } else {
        await this.prisma.product.updateMany({
          where: { id: it.productId, stock: { not: null } }, data: { stock: { increment: it.quantity } },
        }).catch(() => {})
      }
    }
  }

  /** Reverte estoque + uso de cupom + pontos de fidelidade resgatados. Best-effort. */
  async restoreOrderConsumption(orderId: string) {
    await this.restoreStock(orderId)

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true, couponId: true, loyaltyDiscount: true },
    })
    if (!order) return

    // Cupom: libera o uso pelo usuário e devolve 1 ao contador global de usos.
    if (order.couponId) {
      await this.prisma.couponUse.deleteMany({ where: { orderId } }).catch(() => {})
      await this.prisma.coupon.updateMany({
        where: { id: order.couponId, usedCount: { gt: 0 } },
        data: { usedCount: { decrement: 1 } },
      }).catch(() => {})
    }

    // Fidelidade: devolve os pontos resgatados (100 pts = R$10). Guarda contra
    // dupla-restauração checando se já existe um estorno lançado para este pedido.
    const loyaltyDiscount = Number(order.loyaltyDiscount)
    if (loyaltyDiscount > 0) {
      const points = Math.round(loyaltyDiscount * 10)
      const already = await this.prisma.loyaltyTransaction.findFirst({
        where: { orderId, type: 'REFUND' }, select: { id: true },
      })
      if (!already && points > 0) {
        const account = await this.prisma.loyaltyAccount.findUnique({ where: { userId: order.userId } })
        if (account) {
          await this.prisma.$transaction([
            this.prisma.loyaltyAccount.update({ where: { id: account.id }, data: { points: { increment: points } } }),
            this.prisma.loyaltyTransaction.create({
              data: { accountId: account.id, points, type: 'REFUND', description: `Estorno de ${points} pontos (pedido cancelado)`, orderId },
            }),
          ]).catch((err) => this.logger.warn('Loyalty restore failed', err))
        }
      }
    }
  }

  /**
   * Cancela todos os pedidos ainda PENDING de um pagamento e reverte o consumo de
   * cada um. Usado quando o pagamento (PIX) é recusado/expira no webhook do MP.
   * Idempotente: só age em pedidos PENDING (um já cancelado não é tocado de novo).
   */
  async cancelPendingForPayment(paymentId: string): Promise<number> {
    const orders = await this.prisma.order.findMany({
      where: { paymentId, status: 'PENDING' },
      select: { id: true },
    })
    for (const o of orders) {
      const claim = await this.prisma.order.updateMany({
        where: { id: o.id, status: 'PENDING' },
        data: { status: 'CANCELLED', refusalNote: 'Pagamento não confirmado' },
      })
      // Só reverte se ESTE chamador venceu a transição (evita reverter em dobro).
      if (claim.count > 0) await this.restoreOrderConsumption(o.id)
    }
    return orders.length
  }
}
