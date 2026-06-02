import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import MercadoPagoConfig, { Payment as MPPayment } from 'mercadopago'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../common/push.service'
import { NotificationsService } from '../notifications/notifications.service'

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name)
  private mp: MPPayment

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private push: PushService,
    private notifications: NotificationsService,
  ) {
    const client = new MercadoPagoConfig({
      accessToken: this.config.get<string>('MERCADO_PAGO_ACCESS_TOKEN') ?? '',
    })
    this.mp = new MPPayment(client)
  }

  // ── PIX ──────────────────────────────────────────────────────────────────────

  async createPixPayment(paymentId: string, amount: number, orderId: string, payerEmail: string) {
    const apiUrl = this.config.get<string>('API_URL') ?? ''
    const webhookUrl = this.config.get<string>('MERCADO_PAGO_WEBHOOK_URL')
      ?? `${apiUrl}/api/webhooks/mercadopago`

    const response = await this.mp.create({
      body: {
        transaction_amount: amount,
        description: `Pedido #${orderId.slice(0, 8)} — Tá Barato`,
        payment_method_id: 'pix',
        payer: { email: payerEmail },
        notification_url: webhookUrl,
        external_reference: orderId,
        date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
    })

    const pixCode     = response.point_of_interaction?.transaction_data?.qr_code ?? null
    const pixQrBase64 = response.point_of_interaction?.transaction_data?.qr_code_base64 ?? null
    const gatewayId   = String(response.id)

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        gatewayId,
        pixCode,
        pixQrBase64,
        pixExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    })

    return { gatewayId, pixCode, pixQrBase64 }
  }

  // ── Cartão de crédito/débito ──────────────────────────────────────────────────

  async createCardPayment(
    paymentId: string,
    amount: number,
    orderId: string,
    cardToken: string,
    installments: number,
    payerEmail: string,
    payerCpf?: string,
  ) {
    const webhookUrl = this.config.get<string>('MERCADO_PAGO_WEBHOOK_URL')
      ?? `${this.config.get<string>('API_URL') ?? ''}/api/webhooks/mercadopago`

    const response = await this.mp.create({
      body: {
        transaction_amount: amount,
        token: cardToken,
        description: `Pedido #${orderId.slice(0, 8)} — Tá Barato`,
        installments,
        payer: {
          email: payerEmail,
          ...(payerCpf
            ? { identification: { type: 'CPF', number: payerCpf.replace(/\D/g, '') } }
            : {}),
        },
        notification_url: webhookUrl,
        external_reference: orderId,
      } as any,
    })

    const mpStatus  = response.status
    const gatewayId = String(response.id)

    let status: 'PAID' | 'FAILED' | 'PENDING' = 'PENDING'
    if (mpStatus === 'approved') status = 'PAID'
    else if (mpStatus === 'rejected' || mpStatus === 'cancelled') status = 'FAILED'

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { gatewayId, status, paidAt: status === 'PAID' ? new Date() : undefined },
    })

    return { gatewayId, status, mpStatus, statusDetail: (response as any).status_detail }
  }

  // ── Webhook ───────────────────────────────────────────────────────────────────

  async handleWebhook(body: any, xSignature?: string, xRequestId?: string, rawBody?: Buffer) {
    // Verify MP webhook signature when secret is configured
    const webhookSecret = this.config.get<string>('MERCADO_PAGO_WEBHOOK_SECRET')
    if (webhookSecret && xSignature && rawBody) {
      if (!this.verifyMpSignature(webhookSecret, xSignature, xRequestId, rawBody)) {
        this.logger.warn('Webhook signature verification failed — ignoring request')
        return
      }
    }

    if (body?.type !== 'payment' && body?.action !== 'payment.updated') return

    const mpId = body?.data?.id
    if (!mpId) return

    try {
      const mpPayment = await this.mp.get({ id: String(mpId) })
      if (!mpPayment || !mpPayment.external_reference) return

      const orderId  = mpPayment.external_reference as string
      const mpStatus = mpPayment.status

      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          payment: true,
          user: { select: { id: true, pushToken: true } },
          store: { select: { name: true } },
        },
      })
      if (!order?.payment) return

      if (mpStatus === 'approved' && order.payment.status !== 'PAID') {
        // Idempotency: use gatewayId to prevent double-processing on MP retries
        const alreadyProcessed = await this.prisma.payment.findFirst({
          where: { gatewayId: String(mpId), status: 'PAID' },
        })
        if (alreadyProcessed) {
          this.logger.log(`Webhook ${mpId} already processed — skipping`)
          return
        }

        await this.prisma.$transaction([
          this.prisma.payment.update({
            where: { id: order.payment.id },
            data: { status: 'PAID', paidAt: new Date(), gatewayId: String(mpId) },
          }),
          this.prisma.order.update({
            where: { id: orderId },
            data: { status: 'CONFIRMED' },
          }),
        ])

        if (order.user?.pushToken) {
          this.push.send(
            order.user.pushToken,
            '✅ Pagamento confirmado!',
            `Seu pedido em ${order.store.name} foi pago e já está sendo preparado.`,
            { orderId },
          )
        }
        this.notifications.create(
          order.user.id,
          'PAYMENT',
          '✅ Pagamento confirmado!',
          `Pedido #${orderId.slice(0, 8)} pago com sucesso.`,
          { orderId },
        ).catch((err) => this.logger.warn('Notification failed', err))
      }

      if ((mpStatus === 'rejected' || mpStatus === 'cancelled') && order.payment.status === 'PENDING') {
        await this.prisma.payment.update({
          where: { id: order.payment.id },
          data: { status: 'FAILED' },
        })
      }
    } catch (err) {
      this.logger.error('Webhook processing failed', err)
    }
  }

  // ── Poll status (consumer app pulls if webhook misses) ─────────────────────

  async syncPaymentStatus(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    })
    if (!order?.payment?.gatewayId || order.payment.status !== 'PENDING') return order?.payment

    try {
      const mpPayment = await this.mp.get({ id: order.payment.gatewayId })
      if (mpPayment.status === 'approved') {
        const updated = await this.prisma.payment.update({
          where: { id: order.payment.id },
          data: { status: 'PAID', paidAt: new Date() },
        })
        await this.prisma.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED' } })
        return updated
      }
    } catch {}

    return order.payment
  }

  // ── Signature verification ────────────────────────────────────────────────────

  private verifyMpSignature(secret: string, xSignature: string, xRequestId: string | undefined, rawBody: Buffer): boolean {
    try {
      // MP signature format: "ts=<timestamp>,v1=<hash>"
      const parts: Record<string, string> = {}
      for (const part of xSignature.split(',')) {
        const [key, value] = part.split('=')
        if (key && value) parts[key.trim()] = value.trim()
      }

      const ts   = parts['ts']
      const hash = parts['v1']
      if (!ts || !hash) return false

      const manifest = `id:${xRequestId ?? ''};request-id:${xRequestId ?? ''};ts:${ts};`
      const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')

      return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected))
    } catch {
      return false
    }
  }
}
