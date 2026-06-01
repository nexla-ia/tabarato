import { Module } from '@nestjs/common'
import { OrdersController } from './orders.controller'
import { OrdersService } from './orders.service'
import { CouponsModule } from '../coupons/coupons.module'
import { PushService } from '../common/push.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { PaymentsModule } from '../payments/payments.module'
import { CouriersModule } from '../couriers/couriers.module'

@Module({
  imports: [CouponsModule, NotificationsModule, PaymentsModule, CouriersModule],
  controllers: [OrdersController],
  providers: [OrdersService, PushService],
})
export class OrdersModule {}
