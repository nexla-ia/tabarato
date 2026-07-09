import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../common/push.service'
import { NotificationsService } from '../notifications/notifications.service'

/**
 * Lembra a loja quando um pedido AGENDADO está se aproximando do horário.
 * Roda a cada 5 min e envia um único lembrete por pedido (~45 min antes).
 */
@Injectable()
export class ScheduledOrdersService {
  private readonly logger = new Logger(ScheduledOrdersService.name)

  constructor(
    private prisma: PrismaService,
    private push: PushService,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async remindScheduledOrders() {
    const now = Date.now()
    const windowEnd = new Date(now + 45 * 60 * 1000)   // próximos 45 min
    const windowStart = new Date(now - 5 * 60 * 1000)  // tolerância p/ os que acabaram de entrar na janela

    const orders = await this.prisma.order.findMany({
      where: {
        scheduledFor: { gte: windowStart, lte: windowEnd },
        scheduledReminderSent: false,
        status: { in: ['PENDING', 'CONFIRMED', 'PREPARING'] },
        payment: { status: 'PAID' },
      },
      select: {
        id: true, scheduledFor: true,
        store: { select: { userId: true, user: { select: { pushToken: true } } } },
      },
      take: 100,
    })

    for (const o of orders) {
      const when = o.scheduledFor
        ? new Date(o.scheduledFor).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Porto_Velho' })
        : ''
      const token = o.store?.user?.pushToken
      if (token) {
        this.push.send(token, '⏰ Pedido agendado se aproximando', `Há um pedido agendado para as ${when}. Prepare-se!`, { orderId: o.id })
          .catch(() => {})
      }
      if (o.store?.userId) {
        this.notifications.create(o.store.userId, 'ORDER_UPDATE', '⏰ Pedido agendado', `Pedido #${o.id.slice(0, 8)} agendado para as ${when}.`, { orderId: o.id })
          .catch(() => {})
      }
      await this.prisma.order.update({ where: { id: o.id }, data: { scheduledReminderSent: true } }).catch(() => {})
    }

    if (orders.length) this.logger.log(`Lembrete de agendamento enviado para ${orders.length} pedido(s).`)
  }
}
