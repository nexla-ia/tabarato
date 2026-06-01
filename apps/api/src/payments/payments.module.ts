import { Module } from '@nestjs/common'
import { PaymentsController, WebhooksController } from './payments.controller'
import { PaymentsService } from './payments.service'
import { PushService } from '../common/push.service'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController, WebhooksController],
  providers: [PaymentsService, PushService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
