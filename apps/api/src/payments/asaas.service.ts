import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

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

  private get baseUrl(): string {
    return this.config.get<string>('ASAAS_BASE_URL') || 'https://api-sandbox.asaas.com/v3'
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

  /** Valida o token do webhook do Asaas (header asaas-access-token), se configurado. */
  isWebhookAuthorized(token: string | undefined): boolean {
    const expected = this.config.get<string>('ASAAS_WEBHOOK_TOKEN')
    if (!expected) return true // sem token configurado, não bloqueia (dev/sandbox)
    return token === expected
  }
}
