import { Module } from '@nestjs/common'
import { PaymentsController, WebhooksController } from './payments.controller'
import { PaymentsService } from './payments.service'
import { MpOauthService } from './mp-oauth.service'
import { MpConnectController, MpCourierConnectController } from './mp-connect.controller'
import { PushService } from '../common/push.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { OrderConsumptionService } from '../orders/order-consumption.service'

@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController, WebhooksController, MpConnectController, MpCourierConnectController],
  providers: [PaymentsService, MpOauthService, PushService, OrderConsumptionService],
  exports: [PaymentsService, MpOauthService],
})
export class PaymentsModule {}
