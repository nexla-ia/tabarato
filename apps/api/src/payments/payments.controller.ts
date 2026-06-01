import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { PaymentsService } from './payments.service'

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // Consumer polls this to check if PIX was paid (fallback for missed webhooks)
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
  handleMp(@Body() body: any) {
    this.paymentsService.handleWebhook(body)
    return { ok: true }
  }
}
