import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Mercado Pago — Split de pagamento (Marketplace / OAuth).
 *
 * Cada lojista conecta a própria conta MP via OAuth. Guardamos o access/refresh
 * token na loja e, ao cobrar, criamos o pagamento com o token do lojista +
 * `application_fee` (a comissão da plataforma). O MP divide na hora.
 *
 * Tudo é ativado por feature flag: se MERCADO_PAGO_CLIENT_ID/SECRET não estiverem
 * configurados, o marketplace fica desligado e o sistema segue no modo centralizado.
 */
@Injectable()
export class MpOauthService {
  private readonly logger = new Logger(MpOauthService.name)

  constructor(private config: ConfigService, private prisma: PrismaService) {}

  private clientId() { return this.config.get<string>('MERCADO_PAGO_CLIENT_ID') ?? '' }
  private clientSecret() { return this.config.get<string>('MERCADO_PAGO_CLIENT_SECRET') ?? '' }
  private redirectUri() { return this.config.get<string>('MERCADO_PAGO_REDIRECT_URI') ?? '' }
  private stateSecret() { return this.config.get<string>('JWT_SECRET') ?? 'tabarato-mp-state' }

  // ── Criptografia dos tokens em repouso (AES-256-GCM) ──
  // Chave de MP_ENCRYPTION_KEY (32 bytes hex/base64) ou derivada do JWT_SECRET.
  private encKey(): Buffer {
    const raw = this.config.get<string>('MP_ENCRYPTION_KEY')
    if (raw) {
      const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
      if (buf.length === 32) return buf
    }
    return crypto.createHash('sha256').update(this.stateSecret()).digest()
  }

  private encrypt(plain: string | null | undefined): string | null {
    if (!plain) return null
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encKey(), iv)
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `enc:${Buffer.concat([iv, tag, enc]).toString('base64')}`
  }

  private decrypt(value: string | null | undefined): string | null {
    if (!value) return null
    if (!value.startsWith('enc:')) return value // compat: valor legado em texto puro
    try {
      const data = Buffer.from(value.slice(4), 'base64')
      const iv = data.subarray(0, 12)
      const tag = data.subarray(12, 28)
      const enc = data.subarray(28)
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encKey(), iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
    } catch {
      this.logger.error('Falha ao descriptografar token MP')
      return null
    }
  }

  /** Marketplace 1:1 (loja) liga quando as credenciais existem. */
  isEnabled(): boolean {
    return Boolean(this.clientId() && this.clientSecret() && this.redirectUri())
  }

  /** Split 1:N (repasse automático ao entregador) — precisa de aprovação comercial do MP. */
  isAdvancedEnabled(): boolean {
    return this.isEnabled() && this.config.get<string>('MERCADO_PAGO_ADVANCED') === 'true'
  }

  // ── State assinado (evita CSRF / troca de conta no callback) ──
  // subject = "store:<id>" ou "courier:<id>"
  private signState(subject: string): string {
    const payload = `${subject}.${Date.now()}`
    const sig = crypto.createHmac('sha256', this.stateSecret()).update(payload).digest('hex').slice(0, 32)
    return Buffer.from(`${payload}.${sig}`).toString('base64url')
  }

  verifyState(state: string): { type: 'store' | 'courier'; id: string } | null {
    try {
      const decoded = Buffer.from(state, 'base64url').toString('utf8')
      const [subject, ts, sig] = decoded.split('.')
      const expected = crypto.createHmac('sha256', this.stateSecret()).update(`${subject}.${ts}`).digest('hex').slice(0, 32)
      if (sig !== expected) return null
      if (Date.now() - Number(ts) > 30 * 60 * 1000) return null
      const [type, id] = subject.split(':')
      if ((type !== 'store' && type !== 'courier') || !id) return null
      return { type, id }
    } catch {
      return null
    }
  }

  /** URL de autorização pra conectar a conta MP (loja ou entregador). */
  getAuthUrl(type: 'store' | 'courier', id: string): string {
    if (!this.isEnabled()) throw new BadRequestException('Integração Mercado Pago não configurada.')
    const params = new URLSearchParams({
      client_id: this.clientId(),
      response_type: 'code',
      platform_id: 'mp',
      state: this.signState(`${type}:${id}`),
      redirect_uri: this.redirectUri(),
    })
    return `https://auth.mercadopago.com.br/authorization?${params.toString()}`
  }

  private async persist(type: 'store' | 'courier', id: string, data: any) {
    if (type === 'store') return this.prisma.store.update({ where: { id }, data })
    return this.prisma.courier.update({ where: { id }, data })
  }

  /** Troca o code pelo token e salva na loja OU no entregador. */
  async connect(type: 'store' | 'courier', id: string, code: string): Promise<void> {
    const res = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId(),
        client_secret: this.clientSecret(),
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(),
      }),
    })
    const data = await res.json()
    if (!res.ok || !data.access_token) {
      this.logger.error(`MP OAuth exchange failed: ${JSON.stringify(data)}`)
      throw new BadRequestException('Não foi possível conectar a conta Mercado Pago.')
    }
    await this.persist(type, id, {
      mpUserId: String(data.user_id),
      mpAccessToken: this.encrypt(data.access_token),
      mpRefreshToken: this.encrypt(data.refresh_token ?? null),
      mpTokenExpiresAt: new Date(Date.now() + (data.expires_in ?? 15552000) * 1000),
      mpConnected: true,
    })
    this.logger.log(`${type} ${id.slice(0, 8)} conectou o Mercado Pago (user ${data.user_id})`)
  }

  async disconnect(type: 'store' | 'courier', id: string): Promise<void> {
    await this.persist(type, id, { mpConnected: false, mpAccessToken: null, mpRefreshToken: null, mpTokenExpiresAt: null, mpUserId: null })
  }

  /** Renova o token se necessário; devolve um access token válido (ou null). */
  async getValidToken(
    type: 'store' | 'courier',
    entity: { id: string; mpConnected?: boolean | null; mpAccessToken?: string | null; mpRefreshToken?: string | null; mpTokenExpiresAt?: Date | null },
  ): Promise<string | null> {
    if (!entity.mpConnected || !entity.mpAccessToken) return null

    const accessToken = this.decrypt(entity.mpAccessToken)
    const soon = Date.now() + 5 * 60 * 1000
    const expMs = entity.mpTokenExpiresAt ? new Date(entity.mpTokenExpiresAt).getTime() : 0
    if (expMs > soon) return accessToken

    const refreshToken = this.decrypt(entity.mpRefreshToken)
    if (!refreshToken) return accessToken
    try {
      const res = await fetch('https://api.mercadopago.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: this.clientId(), client_secret: this.clientSecret(),
          grant_type: 'refresh_token', refresh_token: refreshToken,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.access_token) {
        this.logger.warn(`MP token refresh falhou p/ ${type} ${entity.id.slice(0, 8)}`)
        return accessToken
      }
      await this.persist(type, entity.id, {
        mpAccessToken: this.encrypt(data.access_token),
        mpRefreshToken: this.encrypt(data.refresh_token ?? refreshToken),
        mpTokenExpiresAt: new Date(Date.now() + (data.expires_in ?? 15552000) * 1000),
      })
      return data.access_token
    } catch (err) {
      this.logger.warn('MP token refresh error', err as any)
      return accessToken
    }
  }

  // Wrappers de compatibilidade
  getValidSellerToken(store: any) { return this.getValidToken('store', store) }
  getValidCourierToken(courier: any) { return this.getValidToken('courier', courier) }

  /**
   * Repasse automático ao entregador (split 1:N) — transfere a taxa de entrega
   * da conta da plataforma pra conta MP do entregador (collector_id = mpUserId).
   *
   * ⚠️ REQUER habilitação comercial do MP (modelo 1:N / Advanced Payments) e é
   * ativado por MERCADO_PAGO_ADVANCED=true. Enquanto não estiver habilitado/confirmado
   * o endpoint exato com o MP, retorna { done:false } e o valor cai na carteira (fallback).
   */
  async payoutCourier(courier: { id: string; mpConnected?: boolean | null; mpUserId?: string | null }, amount: number, orderId: string): Promise<{ done: boolean }> {
    if (!this.isAdvancedEnabled() || !courier.mpConnected || !courier.mpUserId || amount <= 0) {
      return { done: false }
    }
    try {
      // NOTE: a chamada exata de transferência ao collector é definida no onboarding
      // do modelo 1:N com o Mercado Pago. Ponto único de integração:
      //   POST https://api.mercadopago.com/v1/advanced_payments (disbursements)
      //   ou o endpoint de disbursement/transfer indicado pelo MP.
      // Até lá, não movimentamos dinheiro "no escuro":
      this.logger.warn(`payoutCourier: 1:N habilitado mas transferência ainda não plugada (order ${orderId.slice(0,8)}, R$${amount}). Usando carteira.`)
      return { done: false }
    } catch (err) {
      this.logger.error('payoutCourier falhou', err as any)
      return { done: false }
    }
  }
}
