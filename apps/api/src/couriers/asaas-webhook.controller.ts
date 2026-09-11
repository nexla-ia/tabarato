import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common'
import { CouriersService } from './couriers.service'
import { AsaasService } from '../payments/asaas.service'

/**
 * Webhook PÚBLICO do Asaas (sem JWT) — recebe o status das transferências PIX de
 * repasse ao entregador. Configure a URL no painel do Asaas apontando para
 *   POST https://<api>/api/couriers/asaas/webhook
 * e o token de autenticação em ASAAS_WEBHOOK_TOKEN.
 */
@Controller('couriers/asaas')
export class AsaasWebhookController {
  constructor(
    private readonly couriers: CouriersService,
    private readonly asaas: AsaasService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Headers('asaas-access-token') token: string, @Body() body: any) {
    if (!this.asaas.isWebhookAuthorized(token)) {
      throw new UnauthorizedException('Webhook token inválido.')
    }
    const event: string | undefined = body?.event
    const transfer = body?.transfer ?? {}
    if (typeof event === 'string' && event.startsWith('TRANSFER_')) {
      await this.couriers.handleAsaasTransferWebhook(event, {
        id: transfer.id,
        externalReference: transfer.externalReference,
        failReason: transfer.failReason,
      })
    }
    return { received: true }
  }

  /**
   * Autorização automática de saque — "Mecanismo de segurança" do Asaas (Menu →
   * Integrações → Mecanismos de segurança). O Asaas chama isto antes de concluir a
   * transferência; respondemos { status: 'APPROVED' } pra dispensar o token SMS.
   * Configure a mesma URL + token no painel.
   */
  @Post('authorize')
  @HttpCode(200)
  async authorize(@Headers('asaas-access-token') token: string, @Body() body: any) {
    if (!this.asaas.isWebhookAuthorized(token)) {
      throw new UnauthorizedException('Token inválido.')
    }
    return this.couriers.authorizeAsaasTransfer(body)
  }
}
