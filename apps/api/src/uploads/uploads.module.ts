import { Module } from '@nestjs/common'
import { UploadsController } from './uploads.controller'
import { UploadsService } from './uploads.service'
import { FundoBrancoService } from './fundo-branco.service'

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, FundoBrancoService],
  exports: [UploadsService],
})
export class UploadsModule {}
