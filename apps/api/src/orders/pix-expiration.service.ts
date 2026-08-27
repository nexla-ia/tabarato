import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { OrderConsumptionService } from './order-consumption.service'
import { PushService } from '../common/push.service'
import { NotificationsService } from '../notifications/notifications.service'

/**
 * O código PIX vence em PIX_EXPIRATION_MINUTES (o Mercado Pago já recusa o
 * pagamento depois disso), mas sem isto o pedido ficava PENDING pra sempre se
 * ninguém pagasse — ocupando vaga no painel do lojista e segurando
 * estoque/cupom/pontos reservados por um pedido que nunca vai ser pago.
 *
 * Roda a cada 5 min: acha pagamentos PIX vencidos ainda PENDING e cancela os
 * pedidos, reaproveitando a MESMA rotina que o botão "Já paguei — verificar"
 * já usa quando o MP reporta expirado/recusado (cancelPendingForPayment).
 */
@Injectable()
export class PixExpirationService {
  private readonly logger = new Logger(PixExpirationService.name)

  constructor(
    private prisma: PrismaService,
    private orderConsumption: OrderConsumptionService,
    private push: PushService,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cancelExpiredPixPayments() {
    const payments = await this.prisma.payment.findMany({
      where: { method: 'PIX', status: 'PENDING', pixExpiresAt: { lt: new Date() } },
      select: { id: true },
      take: 200,
    })
    if (!payments.length) return

    let cancelled = 0
    for (const p of payments) {
      // Claim atômico: só segue se ESTE processo venceu a transição — evita
      // corrida com o cliente pagando bem na hora em que o cron roda.
      const claim = await this.prisma.payment.updateMany({
        where: { id: p.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      })
      if (claim.count === 0) continue

      const n = await this.orderConsumption.cancelPendingForPayment(p.id)
      cancelled += n

      const orders = await this.prisma.order.findMany({
        where: { paymentId: p.id },
        select: { id: true, userId: true, user: { select: { pushToken: true } } },
      })
      // 1 pagamento pode cobrir vários pedidos (carrinho multi-loja) — mesmo
      // cliente em todos, avisa uma vez só.
      const first = orders[0]
      if (first) {
        if (first.user?.pushToken) {
          this.push.send(first.user.pushToken, '⏰ Pedido cancelado',
            'O código PIX expirou sem pagamento e o pedido foi cancelado automaticamente.',
            { orderId: first.id }).catch(() => {})
        }
        this.notifications.create(first.userId, 'ORDER_UPDATE', '⏰ Pedido cancelado',
          'O código PIX expirou sem pagamento e o pedido foi cancelado automaticamente.',
          { orderId: first.id }).catch(() => {})
      }
    }

    if (cancelled) this.logger.log(`${cancelled} pedido(s) cancelado(s) por PIX expirado sem pagamento.`)
  }
}
