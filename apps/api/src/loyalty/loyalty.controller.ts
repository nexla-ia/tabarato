import { Controller, Get, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { LoyaltyService } from './loyalty.service'

@UseGuards(JwtAuthGuard)
@Controller('users/me/loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get()
  getAccount(@CurrentUser() user: any) {
    return this.loyalty.getOrCreate(user.sub)
  }

  // Note: point redemption happens atomically at checkout (see OrdersService.create,
  // field `pointsToRedeem`). A standalone redeem endpoint is intentionally omitted —
  // it would debit points without tying the discount to an actual order.
}
