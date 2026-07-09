import { Module } from '@nestjs/common'
import { PaymentsController, WebhooksController } from './payments.controller'
import { PaymentsService } from './payments.service'
import { MpOauthService } from './mp-oauth.service'
import { MpConnectController } from './mp-connect.controller'
import { PushService } from '../common/push.service'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController, WebhooksController, MpConnectController],
  providers: [PaymentsService, MpOauthService, PushService],
  exports: [PaymentsService, MpOauthService],
})
export class PaymentsModule {}
