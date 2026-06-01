import { Module } from '@nestjs/common'
import { CourierReviewsController } from './courier-reviews.controller'
import { CourierReviewsService } from './courier-reviews.service'

@Module({
  controllers: [CourierReviewsController],
  providers: [CourierReviewsService],
})
export class CourierReviewsModule {}
