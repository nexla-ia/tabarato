import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { PrismaModule } from '../prisma/prisma.module'
import { UploadsModule } from '../uploads/uploads.module'
import { CouriersModule } from '../couriers/couriers.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PushService } from '../common/push.service'

@Module({
  imports: [PrismaModule, UploadsModule, CouriersModule, NotificationsModule],
  controllers: [AdminController],
  providers: [AdminService, PushService],
})
export class AdminModule {}
