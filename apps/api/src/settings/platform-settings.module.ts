import { Global, Module } from '@nestjs/common'
import { PlatformSettingsService } from './platform-settings.service'
import { PlatformSettingsController } from './platform-settings.controller'
import { PrismaModule } from '../prisma/prisma.module'

// Global: a config de preços é transversal (orders, deliveries, couriers, admin).
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [PlatformSettingsController],
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
