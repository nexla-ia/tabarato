import { Injectable, Logger, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import MercadoPagoConfig, { Payment as MPPayment, PaymentRefund } from 'mercadopago'
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

  /**
   * Extrai uma descrição legível do erro do SDK do Mercado Pago (o QR PIX falhar
   * quase sempre traz o motivo em `cause[].description` — ex.: conta do lojista
   * sem chave PIX cadastrada). Usado pra diagnóstico no log e na mensagem ao app.
   */
  private extractMpError(err: any): string {
    const cause = err?.cause ?? err?.error?.cause ?? err?.response?.cause
    if (Array.isArray(cause) && cause.length) {
      const parts = cause.map((c: any) => c?.description ?? c?.message ?? c?.code).filter(Boolean)
      if (parts.length) return parts.join('; ').slice(0, 200)
    }
    const msg = err?.message ?? err?.error ?? err?.response?.message
    return (typeof msg === 'string' ? msg : JSON.stringify(msg ?? 'erro desconhecido')).slice(0, 200)
  }

  /** Códigos MP crus (cause[].code), separado da descrição — pra diagnosticar no log sem
   *  depender só do texto em inglês (que às vezes é genérico pra várias causas diferentes). */
  private extractMpErrorCodes(err: any): string {
    const cause = err?.cause ?? err?.error?.cause ?? err?.response?.cause
    if (!Array.isArray(cause)) return ''
    return cause.map((c: any) => c?.code).filter(Boolean).join(',')
  }

  // ── PIX ──────────────────────────────────────────────────────────────────────

  async createPixPayment(
    paymentId: string, amount: number, orderId: string, payerEmail: string,
    opts?: { sellerToken?: string | null; applicationFee?: number },
  ) {
    const apiUrl = this.config.get<string>('API_URL') ?? ''
    const webhookUrl = this.config.get<string>('MERCADO_PAGO_WEBHOOK_URL')
      ?? `${apiUrl}/api/webhooks/mercadopago`

    const buildBody = (useSplit: boolean) => ({
      transaction_amount: amount,
      description: `Pedido #${orderId.slice(0, 8)} — Tá Barato`,
      payment_method_id: 'pix',
      payer: { email: payerEmail },
      notification_url: webhookUrl,
      external_reference: orderId,
      date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      // Split: comissão da plataforma vai pra conta da Tá Barato
      ...(useSplit && opts?.sellerToken && opts?.applicationFee
        ? { application_fee: Math.round(opts.applicationFee * 100) / 100 }
        : {}),
    } as any)

    let response: any
    let splitFellBack = false
    try {
      response = await this.clientFor(opts?.sellerToken).create({ body: buildBody(true) })
    } catch (err: any) {
      const detail = this.extractMpError(err)
      const codes = this.extractMpErrorCodes(err)
      this.logger.error(
        `PIX create falhou (pedido ${orderId.slice(0, 8)}, sellerToken=${opts?.sellerToken ? 'sim' : 'não'}, fee=${opts?.applicationFee ?? 0}, codes=${codes || 'n/a'}): ${detail}`,
        JSON.stringify(err?.cause ?? err?.message ?? err ?? ''),
      )
      // "cannot use application_fee": o MP recusou o split nessa cobrança. Causas
      // possíveis (nenhuma diagnosticável só pelo texto genérico do erro — exigem
      // olhar o painel do MP): 1) o App (client_id) não está configurado como
      // "Marketplace" nas integrações do MP; 2) a conta conectada não é elegível
      // pra receber application_fee via PIX (restrição por tipo/nível de conta,
      // mesmo em produção); 3) conta de teste (já bloqueado na conexão).
      // Fallback: cobra centralizado (conta da plataforma, sem comissão embutida)
      // pra não travar a venda enquanto a config do split não é resolvida no MP.
      // O caller marca o pedido como NÃO pago via split (paidViaSplit=false), pra
      // reembolso futuro usar o token certo e a comissão ser retida manualmente.
      if (!opts?.sellerToken || !/application_fee/i.test(detail)) throw new Error(detail)

      this.logger.warn(`PIX pedido ${orderId.slice(0, 8)}: caindo pro modo centralizado (split recusado pelo MP)`)
      try {
        response = await this.clientFor(null).create({ body: buildBody(false) })
        splitFellBack = true
      } catch (err2: any) {
        const detail2 = this.extractMpError(err2)
        this.logger.error(`PIX create (fallback centralizado) também falhou (pedido ${orderId.slice(0, 8)}): ${detail2}`)
        throw new Error(detail2)
      }
    }

    const pixCode     = response.point_of_interaction?.transaction_data?.qr_code ?? null
    const pixQrBase64 = response.point_of_interaction?.transaction_data?.qr_code_base64 ?? null
    const gatewayId   = String(response.id)

    // Sem QR (conta do lojista sem chave PIX / não habilitada a receber PIX):
    // o MP responde 200 mas sem transaction_data. Trata como falha explícita.
    if (!pixCode) {
      this.logger.error(`PIX sem QR (pedido ${orderId.slice(0, 8)}): status=${response?.status} detail=${response?.status_detail}`)
      throw new Error('a conta Mercado Pago do lojista não gerou o QR Code (verifique se há uma chave PIX cadastrada nela)')
    }

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        gatewayId,
        pixCode,
        pixQrBase64,
        pixExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    })

    return { gatewayId, pixCode, pixQrBase64, splitFellBack }
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

    const buildBody = (useSplit: boolean) => ({
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
      ...(useSplit && opts?.sellerToken && opts?.applicationFee
        ? { application_fee: Math.round(opts.applicationFee * 100) / 100 }
        : {}),
    } as any)

    let response: any
    let splitFellBack = false
    try {
      response = await this.clientFor(opts?.sellerToken).create({ body: buildBody(true) })
    } catch (err: any) {
      const detail = this.extractMpError(err)
      if (!opts?.sellerToken || !/application_fee/i.test(detail)) throw err

      this.logger.warn(`Cartão pedido ${orderId.slice(0, 8)}: caindo pro modo centralizado (split recusado pelo MP): ${detail}`)
      response = await this.clientFor(null).create({ body: buildBody(false) })
      splitFellBack = true
    }

    const mpStatus  = response.status
    const gatewayId = String(response.id)

    let status: 'PAID' | 'FAILED' | 'PENDING' = 'PENDING'
    if (mpStatus === 'approved') status = 'PAID'
    else if (mpStatus === 'rejected' || mpStatus === 'cancelled') status = 'FAILED'

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { gatewayId, status, paidAt: status === 'PAID' ? new Date() : undefined },
    })

    return { gatewayId, status, mpStatus, statusDetail: (response as any).status_detail, splitFellBack }
  }

  // ── Webhook ───────────────────────────────────────────────────────────────────

  async handleWebhook(body: any, xSignature?: string, xRequestId?: string, rawBody?: Buffer) {
    const mpId = body?.data?.id

    // Verify MP webhook signature when secret is configured.
    // Manifesto correto do MP: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
    // Se o secret está configurado, a assinatura é OBRIGATÓRIA — rejeita se o
    // header faltar ou não bater (evita bypass omitindo o x-signature).
    const webhookSecret = this.config.get<string>('MERCADO_PAGO_WEBHOOK_SECRET')
    if (webhookSecret) {
      if (!xSignature || !this.verifyMpSignature(webhookSecret, xSignature, xRequestId, mpId)) {
        this.logger.warn('Webhook signature ausente/inválida — ignorando request')
        return
      }
    } else if (this.config.get<string>('NODE_ENV') === 'production') {
      // Fail-closed: em produção, sem secret configurado não processamos nada
      // (evita endpoint anônimo processando/amplificando chamadas ao MP).
      this.logger.error('MERCADO_PAGO_WEBHOOK_SECRET ausente em produção — webhook rejeitado')
      return
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
        // Idempotência ATÔMICA: só UM chamador vence a transição -> PAID (barra
        // notificação/processamento duplicado em retries concorrentes do MP).
        const claim = await this.prisma.payment.updateMany({
          where: { id: order.payment.id, status: { not: 'PAID' } },
          data: { status: 'PAID', paidAt: new Date(), gatewayId: String(mpId) },
        })
        if (claim.count === 0) {
          this.logger.log(`Webhook ${mpId} already processed — skipping`)
          return
        }

        await this.prisma.order.update({
          where: { id: orderId },
          data: { status: 'CONFIRMED' },
        })

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

  async syncPaymentStatus(orderId: string, userId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payment: true,
        store: { select: { id: true, userId: true, mpConnected: true, mpAccessToken: true, mpRefreshToken: true, mpTokenExpiresAt: true } },
      },
    })
    if (!order) throw new NotFoundException('Pedido não encontrado.')
    // Só o dono do pedido (ou o lojista) pode consultar o pagamento
    if (userId && order.userId !== userId && order.store?.userId !== userId) {
      throw new ForbiddenException('Acesso negado.')
    }
    if (!order.payment?.gatewayId || order.payment.status !== 'PENDING') return order.payment

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

  /**
   * Estorno TOTAL de um pagamento pago — usado no cancelamento de pedido.
   * No modo split o dinheiro está na conta do lojista, então estorna com o token
   * do seller; no modo centralizado usa o token da plataforma. Idempotente: se já
   * estiver REFUNDED devolve sucesso; se não estiver PAID, não há o que estornar.
   * Lança BadRequestException se o gateway recusar (o cancelamento deve abortar
   * para não marcar o pedido como cancelado sem devolver o dinheiro).
   */
  async refundPayment(orderId: string): Promise<{ refunded: boolean }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payment: true,
        store: { select: { mpConnected: true, mpAccessToken: true, mpRefreshToken: true, mpTokenExpiresAt: true, mpUserId: true } },
      },
    })
    const payment = order?.payment
    if (!payment) return { refunded: false }
    if (payment.status === 'REFUNDED') return { refunded: true }
    if (payment.status !== 'PAID' || !payment.gatewayId) return { refunded: false }

    const store = order!.store as any
    const sellerToken = order!.paidViaSplit && store?.mpConnected
      ? await this.mpOauth.getValidSellerToken(store)
      : null
    const config = new MercadoPagoConfig({
      accessToken: sellerToken ?? (this.config.get<string>('MERCADO_PAGO_ACCESS_TOKEN') ?? ''),
    })
    try {
      await new PaymentRefund(config).total({
        payment_id: payment.gatewayId,
        requestOptions: { idempotencyKey: `refund-${payment.id}` },
      })
      const updated = await this.prisma.payment.update({
        where: { id: payment.id }, data: { status: 'REFUNDED' },
      })
      return { refunded: updated.status === 'REFUNDED' }
    } catch (err) {
      this.logger.error(`Refund failed for order ${orderId}`, err as any)
      throw new BadRequestException('Não foi possível estornar o pagamento no Mercado Pago. Tente novamente.')
    }
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

      // Anti-replay: rejeita assinaturas antigas (> 5 min). ts pode vir em s ou ms.
      const tsNum = Number(ts)
      if (Number.isFinite(tsNum)) {
        const tsMs = tsNum > 1e12 ? tsNum : tsNum * 1000
        if (Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) return false
      }

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
