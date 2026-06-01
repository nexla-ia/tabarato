import { Module } from '@nestjs/common'
import { CouriersController } from './couriers.controller'
import { CouriersService } from './couriers.service'
import { DeliveryMatchingService } from './delivery-matching.service'
import { DeliveryGateway } from './delivery.gateway'
import { PushService } from '../common/push.service'
import { WalletModule } from '../wallet/wallet.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [WalletModule, NotificationsModule],
  controllers: [CouriersController],
  providers: [CouriersService, PushService, DeliveryMatchingService, DeliveryGateway],
  exports: [DeliveryMatchingService, DeliveryGateway],
})
export class CouriersModule {}
