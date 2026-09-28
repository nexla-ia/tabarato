import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { DeliveriesController } from './deliveries.controller'
import { DeliveriesService } from './deliveries.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { PushService } from '../common/push.service'

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService, PushService],
})
export class DeliveriesModule {}
