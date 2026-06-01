import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
})
export class AppModule {}
