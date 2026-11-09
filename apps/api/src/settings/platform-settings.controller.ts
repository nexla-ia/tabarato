import { Controller, Get } from '@nestjs/common'
import { PlatformSettingsService } from './platform-settings.service'
import { MIN_INSTALLMENT_VALUE } from '../payments/card-plan'

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
      courierBox: { widthCm: p.courierBoxWidthCm, heightCm: p.courierBoxHeightCm, depthCm: p.courierBoxDepthCm, maxKg: p.courierBoxMaxKg },
      // Parcelamento (o app mostra "sem juros"/"com juros") e as taxas que a loja paga
      // (aparecem nos Termos do Lojista).
      card: {
        maxInstallments: p.cardMaxInstallments,
        freeInstallments: p.cardFreeInstallments,
        interestMonthlyPct: p.cardInterestMonthlyPct,
        minInstallmentValue: MIN_INSTALLMENT_VALUE,
      },
      paymentFees: {
        cardPct1x: p.cardFeePct1x,
        cardPct2to6: p.cardFeePct2to6,
        cardPct7to12: p.cardFeePct7to12,
        cardFixed: p.cardFeeFixed,
        pix: p.pixFee,
      },
    }
  }
}
