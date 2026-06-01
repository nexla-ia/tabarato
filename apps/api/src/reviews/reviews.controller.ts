import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { ReviewsService } from './reviews.service'
import { CreateReviewDto } from './dto/create-review.dto'

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(user.sub, dto)
  }

  @Get('store/:storeId')
  findByStore(
    @Param('storeId') storeId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviewsService.findByStore(storeId, Number(page) || 1, Number(limit) || 10)
  }

  @UseGuards(JwtAuthGuard)
  @Get('check/:orderId')
  check(@CurrentUser() user: any, @Param('orderId') orderId: string) {
    return this.reviewsService.checkReviewed(user.sub, orderId)
  }
}
