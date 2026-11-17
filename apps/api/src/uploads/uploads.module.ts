import { Module } from '@nestjs/common'
import { UploadsController } from './uploads.controller'
import { UploadsService } from './uploads.service'
import { FundoBrancoService } from './fundo-branco.service'
import { FundoBrancoLoteService } from './fundo-branco-lote.service'

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, FundoBrancoService, FundoBrancoLoteService],
  exports: [UploadsService, FundoBrancoService, FundoBrancoLoteService],
})
export class UploadsModule {}
