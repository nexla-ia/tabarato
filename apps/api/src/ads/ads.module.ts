import { Module } from '@nestjs/common'
import { AdsController, AdminAdsController } from './ads.controller'
import { AdsService } from './ads.service'
import { PaymentsModule } from '../payments/payments.module'
import { UploadsModule } from '../uploads/uploads.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PushService } from '../common/push.service'
import { MailService } from '../common/mail.service'

@Module({
  imports: [PaymentsModule, UploadsModule, NotificationsModule],
  controllers: [AdsController, AdminAdsController],
  providers: [AdsService, PushService, MailService],
})
export class AdsModule {}
