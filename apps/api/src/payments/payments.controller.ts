import { Body, Controller, Get, Headers, Param, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { PaymentsService } from './payments.service'

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('config')
  getConfig() {
    return this.paymentsService.getPublicConfig()
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders/:orderId/sync')
  syncStatus(@Param('orderId') orderId: string, @CurrentUser() user: any) {
    return this.paymentsService.syncPaymentStatus(orderId, user.sub)
  }
}

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // Throttle generoso: aguenta a rajada de retries do MP, mas barra flood anônimo.
  @Throttle({ default: { ttl: 60_000, limit: 300 } })
  @Post('mercadopago')
  async handleMp(
    @Body() body: any,
    @Headers('x-signature') xSignature: string,
    @Headers('x-request-id') xRequestId: string,
    @Req() req: RawBodyRequest<any>,
  ) {
    await this.paymentsService.handleWebhook(body, xSignature, xRequestId, req.rawBody)
    return { ok: true }
  }

  // Webhook de COBRANÇA do Asaas (entrada de dinheiro). Configure no painel do Asaas
  // (tipo "Cobranças/Payment") apontando pra POST <api>/api/webhooks/asaas com o
  // token em ASAAS_WEBHOOK_TOKEN. (Transferências/saque usam /couriers/asaas/webhook.)
  @Throttle({ default: { ttl: 60_000, limit: 300 } })
  @Post('asaas')
  async handleAsaas(@Body() body: any, @Headers('asaas-access-token') token: string) {
    await this.paymentsService.handleAsaasWebhook(token, body)
    return { received: true }
  }
}
