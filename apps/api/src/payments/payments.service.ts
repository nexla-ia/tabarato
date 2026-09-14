import { Injectable, Logger, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import MercadoPagoConfig, { Payment as MPPayment, PaymentRefund } from 'mercadopago'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../common/push.service'
import { NotificationsService } from '../notifications/notifications.service'
import { MpOauthService } from './mp-oauth.service'
import { AsaasService } from './asaas.service'
import { OrderConsumptionService } from '../orders/order-consumption.service'
import { PIX_EXPIRATION_MS } from './pix.constants'

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
    private asaas: AsaasService,
    private orderConsumption: OrderConsumptionService,
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
    opts?: {
      sellerToken?: string | null; applicationFee?: number
      // Dados do pagador (usados só no modo Asaas p/ criar o cliente)
      userId?: string; payerName?: string; payerCpf?: string; payerPhone?: string
    },
  ): Promise<{ gatewayId: string; pixCode: string | null; pixQrBase64: string | null; splitFellBack: boolean }> {
    // Modo Asaas (entrada centralizada): ignora split — todo o dinheiro entra na
    // conta da plataforma e o repasse à loja/entregador é interno (carteira + saque PIX).
    if (this.asaas.pixInEnabled) {
      return this.createAsaasPixPayment(paymentId, amount, orderId, payerEmail, opts)
    }
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
      date_of_expiration: new Date(Date.now() + PIX_EXPIRATION_MS).toISOString(),
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
        pixExpiresAt: new Date(Date.now() + PIX_EXPIRATION_MS),
      },
    })

    return { gatewayId, pixCode, pixQrBase64, splitFellBack }
  }

  // ── Asaas (entrada centralizada) ────────────────────────────────────────────────

  /**
   * Config pública de pagamento — o checkout usa pra saber qual provedor está ativo
   * por método (ASAAS exige CPF no PIX; no cartão os campos vão crus em vez do token MP).
   */
  getPublicConfig() {
    return {
      pix: this.asaas.pixInEnabled ? 'ASAAS' : 'MP',
      card: this.asaas.cardInEnabled ? 'ASAAS' : 'MP',
    }
  }

  /**
   * Cliente Asaas do pagador — cacheia o id (e o CPF) no User pra reuso. cpfCnpj é
   * exigido pelo Asaas; se não tivermos (nem cache), pede o CPF ao cliente.
   */
  private async getOrCreateAsaasCustomer(
    userId: string,
    payer: { name?: string; email?: string; cpf?: string; phone?: string },
  ): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { asaasCustomerId: true, name: true, email: true, cpf: true, phone: true },
    })
    if (user?.asaasCustomerId) return user.asaasCustomerId

    const cpf = (payer.cpf || user?.cpf || '').replace(/\D/g, '')
    if (!cpf) throw new BadRequestException('Informe seu CPF para concluir o pagamento.')

    const { id } = await this.asaas.createCustomer({
      name: payer.name || user?.name || 'Cliente',
      cpfCnpj: cpf,
      email: payer.email || user?.email || undefined,
      phone: payer.phone || user?.phone || undefined,
      externalReference: userId,
    })
    await this.prisma.user
      .update({ where: { id: userId }, data: { asaasCustomerId: id, ...(user?.cpf ? {} : { cpf }) } })
      .catch((err) => this.logger.warn('Falha ao cachear asaasCustomerId', err as any))
    return id
  }

  private async createAsaasPixPayment(
    paymentId: string, amount: number, orderId: string, payerEmail: string,
    opts?: { userId?: string; payerName?: string; payerCpf?: string; payerPhone?: string },
  ) {
    if (!opts?.userId) throw new BadRequestException('Não foi possível identificar o pagador.')
    const customerId = await this.getOrCreateAsaasCustomer(opts.userId, {
      name: opts.payerName, email: payerEmail, cpf: opts.payerCpf, phone: opts.payerPhone,
    })
    const charge = await this.asaas.createPixCharge({
      customerId, value: amount, orderId, description: `Pedido #${orderId.slice(0, 8)} — Tá Barato`,
    })
    const qr = await this.asaas.getPixQrCode(charge.id)
    const pixCode = qr.payload
    const pixQrBase64 = qr.encodedImage
    if (!pixCode) {
      this.logger.error(`Asaas PIX sem QR (pedido ${orderId.slice(0, 8)}, cobrança ${charge.id})`)
      throw new Error('Não foi possível gerar o QR Code PIX agora.')
    }
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        gatewayId: charge.id,
        gateway: 'ASAAS',
        pixCode,
        pixQrBase64,
        pixExpiresAt: new Date(Date.now() + PIX_EXPIRATION_MS),
      },
    })
    return { gatewayId: charge.id, pixCode, pixQrBase64, splitFellBack: false }
  }

  private async createAsaasCardPayment(
    paymentId: string, amount: number, orderId: string, payerEmail: string,
    installments: number, payerCpf: string | undefined,
    opts?: {
      userId?: string; payerName?: string; payerPhone?: string; remoteIp?: string
      card?: { holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string }
      payerAddress?: { zip_code?: string; street_number?: string; complement?: string }
    },
  ) {
    if (!opts?.userId) throw new BadRequestException('Não foi possível identificar o pagador.')
    if (!opts?.card) throw new BadRequestException('Dados do cartão ausentes.')
    const cpf = (payerCpf || '').replace(/\D/g, '')
    if (!cpf) throw new BadRequestException('Informe o CPF do titular do cartão.')

    const customerId = await this.getOrCreateAsaasCustomer(opts.userId, {
      name: opts.payerName, email: payerEmail, cpf, phone: opts.payerPhone,
    })
    const charge = await this.asaas.createCardCharge({
      customerId, value: amount, orderId, description: `Pedido #${orderId.slice(0, 8)} — Tá Barato`,
      remoteIp: opts.remoteIp,
      installmentCount: installments,
      creditCard: opts.card,
      creditCardHolderInfo: {
        name: opts.payerName || opts.card.holderName,
        email: payerEmail,
        cpfCnpj: cpf,
        postalCode: opts.payerAddress?.zip_code || '',
        addressNumber: opts.payerAddress?.street_number || '0',
        addressComplement: opts.payerAddress?.complement,
        phone: opts.payerPhone,
        mobilePhone: opts.payerPhone,
      },
    })
    const paid = charge.status === 'CONFIRMED' || charge.status === 'RECEIVED'
    const status: 'PAID' | 'FAILED' | 'PENDING' = paid ? 'PAID' : (charge.status === 'PENDING' || charge.status === 'AWAITING_RISK_ANALYSIS' ? 'PENDING' : 'FAILED')
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { gatewayId: charge.id, gateway: 'ASAAS', status, paidAt: status === 'PAID' ? new Date() : undefined },
    })
    return { gatewayId: charge.id, status, mpStatus: charge.status, statusDetail: charge.status, splitFellBack: false }
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
    opts?: {
      sellerToken?: string | null
      applicationFee?: number
      payerFirstName?: string
      payerLastName?: string
      payerPhone?: string
      payerRegDate?: string
      items?: Array<{ id: string; title: string; quantity: number; unit_price: number }>
      deviceId?: string
      payerAddress?: { zip_code?: string; street_name?: string; street_number?: string; complement?: string }
      // Asaas: dados do pagador + cartão cru (o MP usa cardToken; o Asaas usa os campos)
      userId?: string
      remoteIp?: string
      card?: { holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string }
    },
  ) {
    // Modo Asaas (entrada centralizada) — cartão vai com os dados crus (Asaas é PCI).
    if (this.asaas.cardInEnabled) {
      return this.createAsaasCardPayment(paymentId, amount, orderId, payerEmail, installments, payerCpf, {
        userId: opts?.userId,
        payerName: [opts?.payerFirstName, opts?.payerLastName].filter(Boolean).join(' ') || undefined,
        payerPhone: opts?.payerPhone,
        remoteIp: opts?.remoteIp,
        card: opts?.card,
        payerAddress: {
          zip_code: opts?.payerAddress?.zip_code,
          street_number: opts?.payerAddress?.street_number,
          complement: opts?.payerAddress?.complement,
        },
      })
    }
    const webhookUrl = this.config.get<string>('MERCADO_PAGO_WEBHOOK_URL')
      ?? `${this.config.get<string>('API_URL') ?? ''}/api/webhooks/mercadopago`

    const buildBody = (useSplit: boolean) => ({
      transaction_amount: amount,
      token: cardToken,
      description: `Pedido #${orderId.slice(0, 8)} — Tá Barato`,
      statement_descriptor: 'TABARATO',
      installments,
      payer: {
        email: payerEmail,
        ...(opts?.payerFirstName ? { first_name: opts.payerFirstName } : {}),
        ...(opts?.payerLastName ? { last_name: opts.payerLastName } : {}),
        ...(payerCpf
          ? { identification: { type: 'CPF', number: payerCpf.replace(/\D/g, '') } }
          : {}),
      },
      // Antifraude do MP: quanto mais contexto (itens + dados do pagador),
      // menor a chance de "cc_rejected_high_risk".
      additional_info: {
        ...(opts?.items?.length ? { items: opts.items } : {}),
        payer: {
          ...(opts?.payerFirstName ? { first_name: opts.payerFirstName } : {}),
          ...(opts?.payerLastName ? { last_name: opts.payerLastName } : {}),
          ...(opts?.payerPhone
            ? { phone: { area_code: opts.payerPhone.slice(0, 2), number: opts.payerPhone.slice(2) } }
            : {}),
          ...(opts?.payerRegDate ? { registration_date: opts.payerRegDate } : {}),
          ...(opts?.payerAddress ? { address: opts.payerAddress } : {}),
        },
      },
      notification_url: webhookUrl,
      external_reference: orderId,
      ...(useSplit && opts?.sellerToken && opts?.applicationFee
        ? { application_fee: Math.round(opts.applicationFee * 100) / 100 }
        : {}),
    } as any)

    // O device_id (fingerprint gerado pelo security.js do MP no app) vai como header
    // X-Meli-Session-Id. É o dado que MAIS reduz "cc_rejected_high_risk" — sem ele, o
    // antifraude do MP recusa cartão de integração nova por falta de contexto do device.
    const reqOpts = opts?.deviceId ? { requestOptions: { meliSessionId: opts.deviceId } } : {}

    let response: any
    let splitFellBack = false
    try {
      response = await this.clientFor(opts?.sellerToken).create({ body: buildBody(true), ...reqOpts })
    } catch (err: any) {
      const detail = this.extractMpError(err)
      // O cartão é tokenizado com a PUBLIC KEY da plataforma, então cobrar com o token
      // do lojista (split) dá "invalid credentials" / token inválido. Nesses casos (e no
      // application_fee recusado) cai pro modo CENTRALIZADO — token da plataforma, que
      // casa com o token do cartão. O repasse à loja vai pela carteira.
      const fallbackable = /application_fee|invalid.?credential|invalid.*token|card.?token|unauthorized|não autoriz/i.test(detail)
      if (!opts?.sellerToken || !fallbackable) throw err

      this.logger.warn(`Cartão pedido ${orderId.slice(0, 8)}: caindo pro modo centralizado (${detail})`)
      response = await this.clientFor(null).create({ body: buildBody(false), ...reqOpts })
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
      const orderRow = localPayment?.orders?.[0] as any
      const store = orderRow?.store as any
      // Split (paidViaSplit) → pagamento está na conta do lojista, consulta com o
      // token dele. Centralizado (fallback, paidViaSplit=false) → está na conta da
      // plataforma, consulta com o token da plataforma (null). Consultar a conta
      // errada faz o get() não achar o pagamento e o pedido nunca confirmar.
      const sellerToken = orderRow?.paidViaSplit && store?.mpConnected
        ? await this.mpOauth.getValidSellerToken(store)
        : null

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

        // Confirma TODOS os pedidos desse pagamento (multi-loja: N pedidos, 1 pagamento).
        await this.prisma.order.updateMany({
          where: { paymentId: order.payment.id, status: 'PENDING' },
          data: { status: 'CONFIRMED' },
        })

        if (order.user?.pushToken) {
          this.push.send(
            order.user.pushToken,
            '✅ Pagamento confirmado!',
            `Seu pedido foi pago e já está sendo preparado.`,
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
        // Transição atômica -> FAILED (só um chamador vence, evita reprocessar retries).
        const claim = await this.prisma.payment.updateMany({
          where: { id: order.payment.id, status: 'PENDING' },
          data: { status: 'FAILED' },
        })
        if (claim.count === 0) return

        // CRÍTICO: cancelar os pedidos e DEVOLVER estoque/cupom/pontos. Sem isso o
        // pedido ficava PENDING pra sempre — estoque preso, cupom/pontos perdidos, e
        // ocupando o limite de pedidos simultâneos da loja.
        await this.orderConsumption.cancelPendingForPayment(order.payment.id)

        if (order.user?.pushToken) {
          this.push.send(
            order.user.pushToken,
            'Pagamento não concluído',
            'Seu pagamento não foi confirmado e o pedido foi cancelado. Você pode tentar novamente.',
            { orderId },
          )
        }
        this.notifications.create(
          order.user.id,
          'PAYMENT',
          'Pagamento não concluído',
          `O pagamento do pedido #${orderId.slice(0, 8)} não foi confirmado — pedido cancelado.`,
          { orderId },
        ).catch((err) => this.logger.warn('Notification failed', err))
      }
    } catch (err) {
      this.logger.error('Webhook processing failed', err)
    }
  }

  // ── Webhook Asaas (cobrança) ────────────────────────────────────────────────

  /**
   * Webhook de COBRANÇA do Asaas (entrada de dinheiro). Confirma/cancela o pedido
   * conforme o evento. Espelha a lógica do webhook do MP (transição atômica +
   * idempotente). O header asaas-access-token é validado aqui.
   */
  async handleAsaasWebhook(token: string | undefined, body: any) {
    if (!this.asaas.isWebhookAuthorized(token)) {
      this.logger.warn('Asaas webhook (cobrança): token inválido — ignorando')
      return
    }
    const event: string | undefined = body?.event
    const p = body?.payment
    if (!event || !p || !String(event).startsWith('PAYMENT_')) return
    const gatewayId = p.id ? String(p.id) : undefined
    const orderId = p.externalReference as string | undefined
    if (!orderId) return

    const PAID = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']
    const FAILED = ['PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', 'PAYMENT_REPROVED_BY_RISK_ANALYSIS']

    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { payment: true, user: { select: { id: true, pushToken: true } } },
      })
      if (!order?.payment) return

      if (PAID.includes(event) && order.payment.status !== 'PAID') {
        const claim = await this.prisma.payment.updateMany({
          where: { id: order.payment.id, status: { not: 'PAID' } },
          data: { status: 'PAID', paidAt: new Date(), ...(gatewayId ? { gatewayId } : {}) },
        })
        if (claim.count === 0) return
        await this.prisma.order.updateMany({
          where: { paymentId: order.payment.id, status: 'PENDING' }, data: { status: 'CONFIRMED' },
        })
        if (order.user?.pushToken) {
          this.push.send(order.user.pushToken, '✅ Pagamento confirmado!', 'Seu pedido foi pago e já está sendo preparado.', { orderId })
        }
        this.notifications.create(order.user.id, 'PAYMENT', '✅ Pagamento confirmado!', `Pedido #${orderId.slice(0, 8)} pago com sucesso.`, { orderId })
          .catch((err) => this.logger.warn('Notification failed', err))
        return
      }

      if (FAILED.includes(event) && order.payment.status === 'PENDING') {
        const claim = await this.prisma.payment.updateMany({
          where: { id: order.payment.id, status: 'PENDING' }, data: { status: 'FAILED' },
        })
        if (claim.count === 0) return
        await this.orderConsumption.cancelPendingForPayment(order.payment.id)
        if (order.user?.pushToken) {
          this.push.send(order.user.pushToken, 'Pagamento não concluído', 'Seu pagamento não foi confirmado e o pedido foi cancelado. Você pode tentar novamente.', { orderId })
        }
        this.notifications.create(order.user.id, 'PAYMENT', 'Pagamento não concluído', `O pagamento do pedido #${orderId.slice(0, 8)} não foi confirmado — pedido cancelado.`, { orderId })
          .catch((err) => this.logger.warn('Notification failed', err))
        return
      }

      if (event === 'PAYMENT_REFUNDED' && order.payment.status !== 'REFUNDED') {
        await this.prisma.payment.updateMany({
          where: { id: order.payment.id, status: { not: 'REFUNDED' } }, data: { status: 'REFUNDED' },
        })
      }
    } catch (err) {
      this.logger.error('Asaas webhook (cobrança) processing failed', err as any)
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

    // Asaas: consulta a cobrança direto (não usa token de lojista/split).
    if ((order.payment as any).gateway === 'ASAAS') {
      try {
        const p = await this.asaas.getPayment(order.payment.gatewayId)
        if (p.status === 'CONFIRMED' || p.status === 'RECEIVED') {
          const claim = await this.prisma.payment.updateMany({
            where: { id: order.payment.id, status: { not: 'PAID' } },
            data: { status: 'PAID', paidAt: new Date() },
          })
          if (claim.count > 0) {
            await this.prisma.order.updateMany({ where: { paymentId: order.payment.id, status: 'PENDING' }, data: { status: 'CONFIRMED' } })
          }
          return await this.prisma.payment.findUnique({ where: { id: order.payment.id } })
        }
        if (['OVERDUE', 'REFUNDED', 'DELETED'].includes(p.status)) {
          const claim = await this.prisma.payment.updateMany({
            where: { id: order.payment.id, status: 'PENDING' }, data: { status: 'FAILED' },
          })
          if (claim.count > 0) {
            await this.orderConsumption.cancelPendingForPayment(order.payment.id)
            this.notifications.create(order.userId, 'PAYMENT', 'Pagamento não concluído',
              `O pagamento do pedido #${orderId.slice(0, 8)} não foi confirmado — pedido cancelado.`, { orderId })
              .catch((err) => this.logger.warn('Notification failed', err))
            return await this.prisma.payment.findUnique({ where: { id: order.payment.id } })
          }
        }
      } catch {}
      return order.payment
    }

    try {
      const store = order.store as any
      // Mesmo critério do webhook/refund: split → conta do lojista; centralizado
      // (paidViaSplit=false) → conta da plataforma. Consultar a conta certa é o que
      // permite confirmar o pagamento do PIX que caiu no modo centralizado.
      const sellerToken = (order as any).paidViaSplit && store?.mpConnected
        ? await this.mpOauth.getValidSellerToken(store)
        : null
      const mpPayment = await this.clientFor(sellerToken).get({ id: order.payment.gatewayId })
      if (mpPayment.status === 'approved') {
        const updated = await this.prisma.payment.update({
          where: { id: order.payment.id },
          data: { status: 'PAID', paidAt: new Date() },
        })
        // Confirma TODOS os pedidos do pagamento (multi-loja: N pedidos, 1 pagamento).
        await this.prisma.order.updateMany({ where: { paymentId: order.payment.id, status: 'PENDING' }, data: { status: 'CONFIRMED' } })
        return updated
      }
      // PIX recusado/cancelado/expirado: se o webhook se perdeu, o "Já paguei — verificar"
      // resolve aqui — cancela o pedido e DEVOLVE estoque/cupom/pontos (não fica PENDING).
      if (['rejected', 'cancelled', 'expired'].includes(mpPayment.status as string)) {
        const claim = await this.prisma.payment.updateMany({
          where: { id: order.payment.id, status: 'PENDING' },
          data: { status: 'FAILED' },
        })
        if (claim.count > 0) {
          await this.orderConsumption.cancelPendingForPayment(order.payment.id)
          this.notifications.create(order.userId, 'PAYMENT', 'Pagamento não concluído',
            `O pagamento do pedido #${orderId.slice(0, 8)} não foi confirmado — pedido cancelado.`, { orderId })
            .catch((err) => this.logger.warn('Notification failed', err))
          return await this.prisma.payment.findUnique({ where: { id: order.payment.id } })
        }
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

    // Asaas: estorno direto pela cobrança.
    if ((payment as any).gateway === 'ASAAS') {
      try {
        await this.asaas.refundPayment(payment.gatewayId)
        const updated = await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } })
        return { refunded: updated.status === 'REFUNDED' }
      } catch (err) {
        this.logger.error(`Asaas refund failed for order ${orderId}`, err as any)
        throw new BadRequestException('Não foi possível estornar o pagamento no Asaas. Tente novamente.')
      }
    }

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
