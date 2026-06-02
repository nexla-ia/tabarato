import { Body, Controller, Get, Headers, Param, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { PaymentsService } from './payments.service'

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('orders/:orderId/sync')
  syncStatus(@Param('orderId') orderId: string, @CurrentUser() _user: any) {
    return this.paymentsService.syncPaymentStatus(orderId)
  }
}

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('mercadopago')
  handleMp(
    @Body() body: any,
    @Headers('x-signature') xSignature: string,
    @Headers('x-request-id') xRequestId: string,
    @Req() req: RawBodyRequest<any>,
  ) {
    // Validate MP webhook signature before processing
    // handleWebhook will verify using the MERCADO_PAGO_WEBHOOK_SECRET env var
    this.paymentsService.handleWebhook(body, xSignature, xRequestId, req.rawBody)
    return { ok: true }
  }
}
