import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { StoresModule } from './stores/stores.module'
import { ProductsModule } from './products/products.module'
import { OrdersModule } from './orders/orders.module'
import { CouriersModule } from './couriers/couriers.module'
import { UploadsModule } from './uploads/uploads.module'
import { ReviewsModule } from './reviews/reviews.module'
import { CouponsModule } from './coupons/coupons.module'
import { DeliveriesModule } from './deliveries/deliveries.module'
import { AdminModule } from './admin/admin.module'
import { WalletModule } from './wallet/wallet.module'
import { CourierReviewsModule } from './courier-reviews/courier-reviews.module'
import { NotificationsModule } from './notifications/notifications.module'
import { PaymentsModule } from './payments/payments.module'
import { LoyaltyModule } from './loyalty/loyalty.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting global (anti brute-force / abuso). 120 req/min por IP como base.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    StoresModule,
    ProductsModule,
    OrdersModule,
    CouriersModule,
    UploadsModule,
    ReviewsModule,
    CouponsModule,
    DeliveriesModule,
    AdminModule,
    WalletModule,
    CourierReviewsModule,
    NotificationsModule,
    PaymentsModule,
    LoyaltyModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
