import { Controller, Get, Post, Body, UseGuards, BadRequestException } from '@nestjs/common'
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

  @Post('redeem')
  async redeem(@CurrentUser() user: any, @Body() body: { points: number }) {
    if (!body.points || body.points < 100 || body.points % 100 !== 0) {
      throw new BadRequestException('Mínimo de 100 pontos por resgate (múltiplos de 100).')
    }
    const discount = await this.loyalty.redeemPoints(user.sub, body.points)
    return { discount, pointsUsed: body.points }
  }
}
