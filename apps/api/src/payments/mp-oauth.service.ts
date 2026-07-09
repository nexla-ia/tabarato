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

  /** Marketplace só liga quando as credenciais existem. */
  isEnabled(): boolean {
    return Boolean(this.clientId() && this.clientSecret() && this.redirectUri())
  }

  // ── State assinado (evita CSRF / troca de loja no callback) ──
  private signState(storeId: string): string {
    const payload = `${storeId}.${Date.now()}`
    const sig = crypto.createHmac('sha256', this.stateSecret()).update(payload).digest('hex').slice(0, 32)
    return Buffer.from(`${payload}.${sig}`).toString('base64url')
  }

  verifyState(state: string): string | null {
    try {
      const decoded = Buffer.from(state, 'base64url').toString('utf8')
      const [storeId, ts, sig] = decoded.split('.')
      const payload = `${storeId}.${ts}`
      const expected = crypto.createHmac('sha256', this.stateSecret()).update(payload).digest('hex').slice(0, 32)
      if (sig !== expected) return null
      // validade de 30 min
      if (Date.now() - Number(ts) > 30 * 60 * 1000) return null
      return storeId
    } catch {
      return null
    }
  }

  /** URL pra qual o lojista é redirecionado pra autorizar a conexão. */
  getAuthUrl(storeId: string): string {
    if (!this.isEnabled()) throw new BadRequestException('Integração Mercado Pago não configurada.')
    const params = new URLSearchParams({
      client_id: this.clientId(),
      response_type: 'code',
      platform_id: 'mp',
      state: this.signState(storeId),
      redirect_uri: this.redirectUri(),
    })
    return `https://auth.mercadopago.com.br/authorization?${params.toString()}`
  }

  /** Troca o code pelo token do lojista e salva na loja. */
  async connectStore(storeId: string, code: string): Promise<void> {
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

    await this.prisma.store.update({
      where: { id: storeId },
      data: {
        mpUserId: String(data.user_id),
        mpAccessToken: data.access_token,
        mpRefreshToken: data.refresh_token ?? null,
        mpTokenExpiresAt: new Date(Date.now() + (data.expires_in ?? 15552000) * 1000),
        mpConnected: true,
      },
    })
    this.logger.log(`Loja ${storeId.slice(0, 8)} conectou o Mercado Pago (user ${data.user_id})`)
  }

  /** Desconecta a conta MP da loja. */
  async disconnect(storeId: string): Promise<void> {
    await this.prisma.store.update({
      where: { id: storeId },
      data: { mpConnected: false, mpAccessToken: null, mpRefreshToken: null, mpTokenExpiresAt: null, mpUserId: null },
    })
  }

  /** Renova o token se estiver perto de expirar; devolve um access token válido (ou null). */
  async getValidSellerToken(store: {
    id: string; mpConnected?: boolean | null; mpAccessToken?: string | null
    mpRefreshToken?: string | null; mpTokenExpiresAt?: Date | null
  }): Promise<string | null> {
    if (!store.mpConnected || !store.mpAccessToken) return null

    const soon = Date.now() + 5 * 60 * 1000 // 5 min de folga
    const expMs = store.mpTokenExpiresAt ? new Date(store.mpTokenExpiresAt).getTime() : 0
    if (expMs > soon) return store.mpAccessToken

    // precisa renovar
    if (!store.mpRefreshToken) return store.mpAccessToken
    try {
      const res = await fetch('https://api.mercadopago.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: this.clientId(),
          client_secret: this.clientSecret(),
          grant_type: 'refresh_token',
          refresh_token: store.mpRefreshToken,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.access_token) {
        this.logger.warn(`MP token refresh falhou p/ loja ${store.id.slice(0, 8)}`)
        return store.mpAccessToken
      }
      await this.prisma.store.update({
        where: { id: store.id },
        data: {
          mpAccessToken: data.access_token,
          mpRefreshToken: data.refresh_token ?? store.mpRefreshToken,
          mpTokenExpiresAt: new Date(Date.now() + (data.expires_in ?? 15552000) * 1000),
        },
      })
      return data.access_token
    } catch (err) {
      this.logger.warn('MP token refresh error', err as any)
      return store.mpAccessToken
    }
  }
}
