import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { DeliveriesController } from './deliveries.controller'
import { DeliveriesService } from './deliveries.service'

@Module({
  imports: [PrismaModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
})
export class DeliveriesModule {}
