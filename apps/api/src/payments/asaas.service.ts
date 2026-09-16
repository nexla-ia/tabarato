import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'

export interface AsaasTransferResult {
  id: string
  status: string
  authorized: boolean
}

/**
 * Integração com o Asaas para PIX-out (repasse automático ao entregador). Fica
 * DESLIGADA até `ASAAS_API_KEY` existir — sem a key, o saque cai na fila manual.
 *
 * Env:
 *  - ASAAS_API_KEY       chave da API (sandbox começa com $aact_hmlg_, prod $aact_prod_)
 *  - ASAAS_BASE_URL      default sandbox (https://api-sandbox.asaas.com/v3);
 *                        produção = https://api.asaas.com/v3
 *  - ASAAS_WEBHOOK_TOKEN token que o Asaas envia no header p/ validar o webhook
 */
@Injectable()
export class AsaasService {
  private readonly logger = new Logger(AsaasService.name)
  constructor(private config: ConfigService) {}

  /** Só envia PIX automático quando a key está configurada. */
  get enabled(): boolean {
    return Boolean(this.config.get<string>('ASAAS_API_KEY'))
  }

  /** Entrada de dinheiro via Asaas (PIX) — liga só quando a key existe E a flag está ligada. */
  get pixInEnabled(): boolean {
    return this.enabled && this.config.get<string>('ASAAS_PIX_ENABLED') === 'true'
  }

  /** Entrada de dinheiro via Asaas (cartão) — liga só quando a key existe E a flag está ligada. */
  get cardInEnabled(): boolean {
    return this.enabled && this.config.get<string>('ASAAS_CARD_ENABLED') === 'true'
  }

  /** Entrada de dinheiro pelo Asaas ativa (PIX ou cartão). Quando true, o modelo é
   *  CENTRALIZADO (sem split/marketplace do MP; repasse à loja via carteira + saque PIX). */
  get moneyInEnabled(): boolean {
    return this.pixInEnabled || this.cardInEnabled
  }

  private get baseUrl(): string {
    return this.config.get<string>('ASAAS_BASE_URL') || 'https://api-sandbox.asaas.com/v3'
  }

  /** Chamada genérica à API do Asaas. Lança Error com a descrição do provedor quando !ok. */
  private async api<T = any>(method: string, path: string, body?: any): Promise<T> {
    const apiKey = this.config.get<string>('ASAAS_API_KEY')
    if (!apiKey) throw new Error('ASAAS_API_KEY não configurada')
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TaBarato',
        access_token: apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = data?.errors?.[0]?.description || `Falha na API Asaas (HTTP ${res.status})`
      this.logger.error(`Asaas ${method} ${path} falhou: ${msg}`)
      const err: any = new Error(msg)
      err.asaas = data?.errors ?? data
      err.httpStatus = res.status
      throw err
    }
    return data as T
  }

  /** dueDate exigido pelo Asaas — usamos "hoje" (PIX/cartão são cobrança imediata). */
  private today(): string {
    // Vilhena/RO = UTC-4. Fixa o fuso pra não virar o dia à meia-noite UTC.
    const now = new Date(Date.now() - 4 * 60 * 60 * 1000)
    return now.toISOString().slice(0, 10)
  }

  // ── ENTRADA DE DINHEIRO (cobrança) ─────────────────────────────────────────────

  /**
   * Cria (ou reaproveita não é feito aqui — quem cacheia é o PaymentsService) um
   * cliente no Asaas. cpfCnpj é OBRIGATÓRIO pra emitir cobrança.
   */
  async createCustomer(input: {
    name: string
    cpfCnpj: string
    email?: string
    phone?: string
    externalReference?: string
  }): Promise<{ id: string }> {
    const data = await this.api<any>('POST', '/customers', {
      name: input.name,
      cpfCnpj: (input.cpfCnpj || '').replace(/\D/g, ''),
      email: input.email,
      mobilePhone: input.phone ? input.phone.replace(/\D/g, '') : undefined,
      externalReference: input.externalReference,
      notificationDisabled: true, // não deixa o Asaas mandar cobrança por e-mail/SMS ao cliente
    })
    return { id: data.id }
  }

  /** Cria uma cobrança PIX. Retorna o id da cobrança e o status inicial (PENDING). */
  async createPixCharge(input: {
    customerId: string
    value: number
    orderId: string
    description?: string
  }): Promise<{ id: string; status: string }> {
    const data = await this.api<any>('POST', '/payments', {
      customer: input.customerId,
      billingType: 'PIX',
      value: Math.round(input.value * 100) / 100,
      dueDate: this.today(),
      description: input.description,
      externalReference: input.orderId,
    })
    return { id: data.id, status: data.status }
  }

  /** Busca o QR Code (imagem base64 + copia-e-cola) de uma cobrança PIX. */
  async getPixQrCode(paymentId: string): Promise<{ encodedImage: string | null; payload: string | null }> {
    const data = await this.api<any>('GET', `/payments/${paymentId}/pixQrCode`)
    return { encodedImage: data.encodedImage ?? null, payload: data.payload ?? null }
  }

  /**
   * Cria uma cobrança de cartão (autorização SÍNCRONA — os dados do cartão vão no
   * corpo; o Asaas é PCI e não guardamos o PAN). status CONFIRMED/RECEIVED = pago.
   */
  async createCardCharge(input: {
    customerId: string
    value: number
    orderId: string
    description?: string
    remoteIp?: string
    installmentCount?: number
    creditCard: { holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string }
    creditCardHolderInfo: {
      name: string; email: string; cpfCnpj: string; postalCode: string
      addressNumber: string; addressComplement?: string; phone?: string; mobilePhone?: string
    }
  }): Promise<{ id: string; status: string }> {
    const installments = input.installmentCount && input.installmentCount > 1 ? input.installmentCount : undefined
    const value = Math.round(input.value * 100) / 100
    const holder = input.creditCardHolderInfo
    const data = await this.api<any>('POST', '/payments', {
      customer: input.customerId,
      billingType: 'CREDIT_CARD',
      dueDate: this.today(),
      description: input.description,
      externalReference: input.orderId,
      ...(installments ? { installmentCount: installments, totalValue: value } : { value }),
      creditCard: {
        holderName: input.creditCard.holderName,
        number: (input.creditCard.number || '').replace(/\D/g, ''),
        expiryMonth: input.creditCard.expiryMonth,
        expiryYear: input.creditCard.expiryYear,
        ccv: input.creditCard.ccv,
      },
      creditCardHolderInfo: {
        name: holder.name,
        email: holder.email,
        cpfCnpj: (holder.cpfCnpj || '').replace(/\D/g, ''),
        postalCode: (holder.postalCode || '').replace(/\D/g, ''),
        addressNumber: holder.addressNumber || '0',
        addressComplement: holder.addressComplement,
        phone: holder.phone ? holder.phone.replace(/\D/g, '') : undefined,
        mobilePhone: holder.mobilePhone ? holder.mobilePhone.replace(/\D/g, '') : undefined,
      },
      ...(input.remoteIp ? { remoteIp: input.remoteIp } : {}),
    })
    return { id: data.id, status: data.status }
  }

  /** Consulta o status atual de uma cobrança (poll quando o webhook se perde). */
  async getPayment(paymentId: string): Promise<{ id: string; status: string; value: number; externalReference: string | null }> {
    const data = await this.api<any>('GET', `/payments/${paymentId}`)
    return { id: data.id, status: data.status, value: Number(data.value), externalReference: data.externalReference ?? null }
  }

  /** Consulta o status REAL de uma transferência (usado pra validar o webhook de saque). */
  async getTransfer(transferId: string): Promise<{ id: string; status: string }> {
    const data = await this.api<any>('GET', `/transfers/${transferId}`)
    return { id: data.id, status: data.status }
  }

  /** Estorno TOTAL de uma cobrança paga (usado no cancelamento do pedido). */
  async refundPayment(paymentId: string): Promise<{ status: string }> {
    const data = await this.api<any>('POST', `/payments/${paymentId}/refund`, {})
    return { status: data.status }
  }

  /**
   * Cria um Checkout HOSPEDADO (página do Asaas) pra pagamento com CARTÃO. O cliente
   * digita o cartão na página do Asaas — os dados NÃO passam pelo nosso backend (PCI
   * mínimo). Retorna o link pra redirecionar/abrir. O status vem pelo webhook
   * CHECKOUT_PAID/CANCELED/EXPIRED. `externalReference` = id do pedido.
   */
  async createCheckout(input: {
    value: number
    orderId: string
    itemName: string
    itemDescription?: string
    installments?: number
    successUrl: string
    cancelUrl: string
    expiredUrl?: string
    customerId?: string
  }): Promise<{ id: string; link: string; status: string }> {
    const value = Math.round(input.value * 100) / 100
    const maxInst = input.installments && input.installments > 1 ? Math.min(input.installments, 21) : 1
    const data = await this.api<any>('POST', '/checkouts', {
      billingTypes: ['CREDIT_CARD'],
      chargeTypes: maxInst > 1 ? ['DETACHED', 'INSTALLMENT'] : ['DETACHED'],
      minutesToExpire: 60,
      callback: {
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        ...(input.expiredUrl ? { expiredUrl: input.expiredUrl } : {}),
      },
      items: [{ name: input.itemName.slice(0, 30), description: input.itemDescription, quantity: 1, value }],
      externalReference: input.orderId,
      ...(maxInst > 1 ? { installment: { maxInstallmentCount: maxInst } } : {}),
      ...(input.customerId ? { customer: input.customerId } : {}),
    })
    return { id: data.id, link: data.link, status: data.status }
  }

  /** Consulta o status de um Checkout (poll quando o webhook se perde). */
  async getCheckout(id: string): Promise<{ id: string; status: string }> {
    const data = await this.api<any>('GET', `/checkouts/${id}`)
    return { id: data.id, status: data.status }
  }

  /**
   * Cria uma transferência PIX para a chave do entregador. ASSÍNCRONO: o retorno
   * só diz que foi criada; o status final (DONE/FAILED) chega pelo webhook.
   * `externalReference` = id do nosso saque (idempotência/rastreio).
   */
  async createPixTransfer(input: {
    value: number
    pixAddressKey: string
    pixAddressKeyType?: string | null
    externalReference: string
    description?: string
  }): Promise<AsaasTransferResult> {
    const apiKey = this.config.get<string>('ASAAS_API_KEY')
    if (!apiKey) throw new Error('ASAAS_API_KEY não configurada')

    const res = await fetch(`${this.baseUrl}/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TaBarato',
        access_token: apiKey,
      },
      body: JSON.stringify({
        value: input.value,
        pixAddressKey: input.pixAddressKey,
        pixAddressKeyType: input.pixAddressKeyType ?? undefined,
        operationType: 'PIX',
        description: input.description,
        externalReference: input.externalReference,
      }),
    })

    const data: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = data?.errors?.[0]?.description || `Falha na transferência Asaas (HTTP ${res.status})`
      this.logger.error(`createPixTransfer failed: ${msg}`)
      throw new Error(msg)
    }
    // authorized=false → a conta exige token SMS por transferência (precisa configurar
    // autorização automática no painel do Asaas p/ ser 100% automático).
    if (data.authorized === false) {
      this.logger.warn(`Transferência ${data.id} criada mas NÃO autorizada (aguardando token SMS no painel Asaas).`)
    }
    return { id: data.id, status: data.status, authorized: data.authorized ?? true }
  }

  /**
   * Valida o token do webhook do Asaas (header asaas-access-token). FAIL-CLOSED em
   * produção: sem token configurado, rejeita (não deixa o webhook anônimo). Comparação
   * timing-safe pra não vazar o token por análise de tempo.
   */
  isWebhookAuthorized(token: string | undefined): boolean {
    const expected = this.config.get<string>('ASAAS_WEBHOOK_TOKEN')
    if (!expected) {
      // Em produção, sem segredo configurado = fecha (igual ao webhook do Mercado Pago).
      if (this.config.get<string>('NODE_ENV') === 'production') {
        this.logger.error('ASAAS_WEBHOOK_TOKEN ausente em produção — webhook rejeitado')
        return false
      }
      return true // dev/sandbox: sem token, não bloqueia
    }
    if (!token) return false
    const a = Buffer.from(token)
    const b = Buffer.from(expected)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  }
}
