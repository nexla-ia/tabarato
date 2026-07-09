import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import MercadoPagoConfig, { Payment as MPPayment } from 'mercadopago'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../common/push.service'
import { NotificationsService } from '../notifications/notifications.service'
import { MpOauthService } from './mp-oauth.service'

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name)
  private mp: MPPayment

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private push: PushService,
    private notifications: NotificationsService,
    private mpOauth: MpOauthService,
  ) {
    const client = new MercadoPagoConfig({
      accessToken: this.config.get<string>('MERCADO_PAGO_ACCESS_TOKEN') ?? '',
    })
    this.mp = new MPPayment(client)
  }

  /** Cliente MP com o token do lojista (split) ou o token da plataforma (centralizado). */
  private clientFor(sellerToken?: string | null): MPPayment {
    if (!sellerToken) return this.mp
    return new MPPayment(new MercadoPagoConfig({ accessToken: sellerToken }))
  }

  // ── PIX ──────────────────────────────────────────────────────────────────────

  async createPixPayment(
    paymentId: string, amount: number, orderId: string, payerEmail: string,
    opts?: { sellerToken?: string | null; applicationFee?: number },
  ) {
    const apiUrl = this.config.get<string>('API_URL') ?? ''
    const webhookUrl = this.config.get<string>('MERCADO_PAGO_WEBHOOK_URL')
      ?? `${apiUrl}/api/webhooks/mercadopago`

    const response = await this.clientFor(opts?.sellerToken).create({
      body: {
        transaction_amount: amount,
        description: `Pedido #${orderId.slice(0, 8)} — Tá Barato`,
        payment_method_id: 'pix',
        payer: { email: payerEmail },
        notification_url: webhookUrl,
        external_reference: orderId,
        date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        // Split: comissão da plataforma vai pra conta da Tá Barato
        ...(opts?.sellerToken && opts?.applicationFee
          ? { application_fee: Math.round(opts.applicationFee * 100) / 100 }
          : {}),
      } as any,
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
    opts?: { sellerToken?: string | null; applicationFee?: number },
  ) {
    const webhookUrl = this.config.get<string>('MERCADO_PAGO_WEBHOOK_URL')
      ?? `${this.config.get<string>('API_URL') ?? ''}/api/webhooks/mercadopago`

    const response = await this.clientFor(opts?.sellerToken).create({
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
        ...(opts?.sellerToken && opts?.applicationFee
          ? { application_fee: Math.round(opts.applicationFee * 100) / 100 }
          : {}),
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
    const mpId = body?.data?.id

    // Verify MP webhook signature when secret is configured.
    // Manifesto correto do MP: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
    const webhookSecret = this.config.get<string>('MERCADO_PAGO_WEBHOOK_SECRET')
    if (webhookSecret && xSignature) {
      if (!this.verifyMpSignature(webhookSecret, xSignature, xRequestId, mpId)) {
        this.logger.warn('Webhook signature verification failed — ignoring request')
        return
      }
    }

    if (body?.type !== 'payment' && body?.action !== 'payment.updated') return

    if (!mpId) return

    try {
      // Resolve o token certo: split (marketplace) usa o token do lojista;
      // modo centralizado usa o token da plataforma.
      const localPayment = await this.prisma.payment.findFirst({
        where: { gatewayId: String(mpId) },
        include: {
          orders: {
            include: {
              store: { select: { id: true, mpConnected: true, mpAccessToken: true, mpRefreshToken: true, mpTokenExpiresAt: true } },
            },
          },
        },
      })
      const store = localPayment?.orders?.[0]?.store as any
      const sellerToken = store?.mpConnected ? await this.mpOauth.getValidSellerToken(store) : null

      const mpPayment = await this.clientFor(sellerToken).get({ id: String(mpId) })
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
      include: {
        payment: true,
        store: { select: { id: true, mpConnected: true, mpAccessToken: true, mpRefreshToken: true, mpTokenExpiresAt: true } },
      },
    })
    if (!order?.payment?.gatewayId || order.payment.status !== 'PENDING') return order?.payment

    try {
      const store = order.store as any
      const sellerToken = store?.mpConnected ? await this.mpOauth.getValidSellerToken(store) : null
      const mpPayment = await this.clientFor(sellerToken).get({ id: order.payment.gatewayId })
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

  private verifyMpSignature(secret: string, xSignature: string, xRequestId: string | undefined, dataId: string | number | undefined): boolean {
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

      // data.id deve ser lowercase quando alfanumérico (regra do MP)
      const id = String(dataId ?? '').toLowerCase()
      const manifest = `id:${id};request-id:${xRequestId ?? ''};ts:${ts};`
      const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')

      const a = Buffer.from(hash)
      const b = Buffer.from(expected)
      return a.length === b.length && crypto.timingSafeEqual(a, b)
    } catch {
      return false
    }
  }
}
