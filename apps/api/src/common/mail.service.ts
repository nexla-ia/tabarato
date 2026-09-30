import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/**
 * Envio de e-mail transacional via Resend (HTTP puro — sem SDK/dependência nova).
 *
 * Sem RESEND_API_KEY configurada o serviço fica em modo "não enviou": devolve false
 * e, fora de produção, escreve o conteúdo no log. Assim dá pra testar o fluxo de
 * recuperação de senha antes de contratar/configurar o provedor, sem quebrar nada.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)

  constructor(private config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.get<string>('RESEND_API_KEY'))
  }

  private get from(): string {
    return this.config.get<string>('MAIL_FROM') || 'Tá Barato <onboarding@resend.dev>'
  }

  /** Retorna true se o provedor aceitou o envio. Nunca lança — o chamador não deve
   *  vazar, pela resposta, se o e-mail existe ou se o envio falhou. */
  async send(to: string, subject: string, html: string, text?: string): Promise<boolean> {
    if (!this.enabled) {
      if (this.config.get<string>('NODE_ENV') !== 'production') {
        this.logger.warn(`[mail:dev] Para: ${to} | ${subject}\n${text ?? html}`)
      } else {
        this.logger.error('RESEND_API_KEY ausente — e-mail NÃO enviado em produção.')
      }
      return false
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.get<string>('RESEND_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: this.from, to: [to], subject, html, ...(text ? { text } : {}) }),
      })
      if (!res.ok) {
        this.logger.error(`Resend recusou o envio (${res.status}): ${(await res.text()).slice(0, 200)}`)
        return false
      }
      return true
    } catch (err) {
      this.logger.error('Falha ao enviar e-mail', err as Error)
      return false
    }
  }

  /** E-mail do código de recuperação de senha. */
  async sendPasswordResetCode(to: string, name: string, code: string, minutes: number) {
    const first = (name || '').split(' ')[0] || 'Olá'
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1A0A00">
        <h1 style="font-size:20px;margin:0 0 4px">Recuperar sua senha</h1>
        <p style="font-size:14px;color:#7A5C4A;margin:0 0 20px">${first}, use o código abaixo no app do Tá Barato.</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:10px;text-align:center;
                    background:#FFF0E6;color:#FF6600;border-radius:12px;padding:18px 0;margin-bottom:18px">${code}</div>
        <p style="font-size:13px;color:#7A5C4A;margin:0 0 6px">O código vale por ${minutes} minutos e só pode ser usado uma vez.</p>
        <p style="font-size:13px;color:#7A5C4A;margin:0">Se não foi você que pediu, ignore este e-mail — sua senha continua a mesma.</p>
      </div>`
    const text = `${first}, seu código para recuperar a senha do Tá Barato é ${code}. `
      + `Vale por ${minutes} minutos e só pode ser usado uma vez. `
      + `Se não foi você que pediu, ignore este e-mail.`
    return this.send(to, `${code} é seu código do Tá Barato`, html, text)
  }
}
