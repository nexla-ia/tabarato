import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { CourierReviewsService } from './courier-reviews.service'

@UseGuards(JwtAuthGuard)
@Controller('courier-reviews')
export class CourierReviewsController {
  constructor(private readonly service: CourierReviewsService) {}

  @Post()
  create(@CurrentUser() user: any, @Body() body: { orderId: string; rating: number; comment?: string }) {
    return this.service.create(user.sub, body)
  }

  @Get('check')
  check(@CurrentUser() user: any, @Query('orderId') orderId: string) {
    return this.service.checkReviewed(user.sub, orderId)
  }
}
