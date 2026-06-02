import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { CouriersController } from './couriers.controller'
import { CouriersService } from './couriers.service'
import { DeliveryMatchingService } from './delivery-matching.service'
import { DeliveryGateway } from './delivery.gateway'
import { PushService } from '../common/push.service'
import { WalletModule } from '../wallet/wallet.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
    WalletModule,
    NotificationsModule,
  ],
  controllers: [CouriersController],
  providers: [CouriersService, PushService, DeliveryMatchingService, DeliveryGateway],
  exports: [DeliveryMatchingService, DeliveryGateway],
})
export class CouriersModule {}
