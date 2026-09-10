import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { PrismaModule } from '../prisma/prisma.module'
import { UploadsModule } from '../uploads/uploads.module'
import { CouriersModule } from '../couriers/couriers.module'

@Module({
  imports: [PrismaModule, UploadsModule, CouriersModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
