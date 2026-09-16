import { Global, Injectable, Logger, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'

/**
 * Criptografia AES-256-GCM pra segredos em repouso (ex.: apiKey das subcontas Asaas
 * das lojas). Mesma abordagem dos tokens do Mercado Pago. Chave: MP_ENCRYPTION_KEY
 * (32 bytes hex/base64) ou derivada do JWT_SECRET (fallback). Valores legados em
 * texto puro (sem prefixo "enc:") são devolvidos como estão pra compatibilidade.
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name)
  constructor(private config: ConfigService) {}

  private key(): Buffer {
    const raw = this.config.get<string>('MP_ENCRYPTION_KEY')
    if (raw) {
      const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
      if (buf.length === 32) return buf
    }
    const secret = this.config.get<string>('JWT_SECRET') || ''
    return crypto.createHash('sha256').update(secret).digest()
  }

  encrypt(plain: string | null | undefined): string | null {
    if (!plain) return null
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key(), iv)
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `enc:${Buffer.concat([iv, tag, enc]).toString('base64')}`
  }

  decrypt(value: string | null | undefined): string | null {
    if (!value) return null
    if (!value.startsWith('enc:')) return value
    try {
      const data = Buffer.from(value.slice(4), 'base64')
      const iv = data.subarray(0, 12)
      const tag = data.subarray(12, 28)
      const enc = data.subarray(28)
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key(), iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
    } catch {
      this.logger.error('Falha ao descriptografar segredo')
      return null
    }
  }
}

@Global()
@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
