import { Controller, Get } from '@nestjs/common'
import { PlatformSettingsService } from './platform-settings.service'

/**
 * Preços vigentes, SEM autenticação.
 *
 * Existe por causa dos Termos de Uso: as taxas são editáveis pelo admin
 * (tabela `platform_settings`), então qualquer número escrito à mão numa página
 * legal vira mentira no primeiro ajuste de comissão — e comissão é exatamente o
 * que o lojista aceita ao se cadastrar. A página pública lê daqui.
 *
 * Só expõe o que já aparece pro usuário no checkout/painel; nada sensível.
 */
@Controller('config')
export class PlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get('pricing')
  async pricing() {
    const p = await this.settings.get()
    return {
      deliveryBaseFee: p.deliveryBaseFee,
      deliveryPerKm: p.deliveryPerKm,
      deliveryMinFee: p.deliveryMinFee,
      courierBaseFee: p.courierBaseFee,
      courierPerKm: p.courierPerKm,
      platformCommissionPct: p.platformCommissionPct,
      maxDeliveryValue: p.maxDeliveryValue,
    }
  }
}
