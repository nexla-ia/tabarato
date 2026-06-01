import { Module } from '@nestjs/common'
import { StoresController } from './stores.controller'
import { StoresService } from './stores.service'
import { WalletModule } from '../wallet/wallet.module'

@Module({
  imports: [WalletModule],
  controllers: [StoresController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
