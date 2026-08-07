import { Module } from '@nestjs/common'
import { StoresController } from './stores.controller'
import { StoresService } from './stores.service'
import { WalletModule } from '../wallet/wallet.module'
import { PaymentsModule } from '../payments/payments.module'

@Module({
  imports: [WalletModule, PaymentsModule],
  controllers: [StoresController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
