import { Module } from '@nestjs/common'
import { OrdersController } from './orders.controller'
import { OrdersService } from './orders.service'
import { OrderConsumptionService } from './order-consumption.service'
import { ScheduledOrdersService } from './scheduled-orders.service'
import { PixExpirationService } from './pix-expiration.service'
import { CouponsModule } from '../coupons/coupons.module'
import { PushService } from '../common/push.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { PaymentsModule } from '../payments/payments.module'
import { CouriersModule } from '../couriers/couriers.module'
import { WalletModule } from '../wallet/wallet.module'
import { LoyaltyModule } from '../loyalty/loyalty.module'

@Module({
  imports: [CouponsModule, NotificationsModule, PaymentsModule, CouriersModule, WalletModule, LoyaltyModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderConsumptionService, ScheduledOrdersService, PixExpirationService, PushService],
})
export class OrdersModule {}
