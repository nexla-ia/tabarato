import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator'

// Todos opcionais: o admin pode ajustar só um campo. Faixas evitam valor absurdo.
export class UpdatePricingDto {
  @IsOptional() @IsNumber() @Min(0) @Max(1000)
  deliveryBaseFee?: number

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  deliveryPerKm?: number

  @IsOptional() @IsNumber() @Min(0) @Max(1000)
  deliveryMinFee?: number

  @IsOptional() @IsNumber() @Min(0) @Max(1000)
  courierBaseFee?: number

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  courierPerKm?: number

  // Comissão em % (0 a 100).
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  platformCommissionPct?: number

  // Teto de valor (produtos) para entrega por motoboy. Acima disso, só retirada
  // na loja. 0 = sem limite. Até R$ 1 milhão.
  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000)
  maxDeliveryValue?: number

  // Anúncios pagos na vitrine. Mínimo R$ 1/dia: valor zero não gera PIX e o
  // anúncio ficaria preso em "aguardando pagamento".
  @IsOptional() @IsNumber() @Min(1) @Max(10_000)
  adPricePerDay?: number

  @IsOptional() @IsInt() @Min(1) @Max(90)
  adMinDays?: number

  @IsOptional() @IsInt() @Min(1) @Max(20)
  adSlots?: number

  @IsOptional() @IsInt() @Min(1) @Max(30)
  adPayDeadlineDays?: number

  // Baú dos entregadores, mostrado ao lojista no cadastro de produto.
  @IsOptional() @IsInt() @Min(1) @Max(300)
  courierBoxWidthCm?: number

  @IsOptional() @IsInt() @Min(1) @Max(300)
  courierBoxHeightCm?: number

  @IsOptional() @IsInt() @Min(1) @Max(300)
  courierBoxDepthCm?: number

  @IsOptional() @IsInt() @Min(1) @Max(200)
  courierBoxMaxKg?: number

  // Cartão: até quantas vezes (o Asaas aceita até 21) e quantas sem juros.
  @IsOptional() @IsInt() @Min(1) @Max(21)
  cardMaxInstallments?: number

  @IsOptional() @IsInt() @Min(1) @Max(21)
  cardFreeInstallments?: number

  // Juros ao mês cobrado do cliente acima das parcelas sem juros (%).
  @IsOptional() @IsNumber() @Min(0) @Max(15)
  cardInterestMonthlyPct?: number

  // Taxas do Asaas (pagas pela loja). Percentuais por faixa + fixo por cobrança.
  @IsOptional() @IsNumber() @Min(0) @Max(20)
  cardFeePct1x?: number

  @IsOptional() @IsNumber() @Min(0) @Max(20)
  cardFeePct2to6?: number

  @IsOptional() @IsNumber() @Min(0) @Max(20)
  cardFeePct7to12?: number

  @IsOptional() @IsNumber() @Min(0) @Max(20)
  cardFeeFixed?: number

  // Taxa do PIX cobrada da loja. 0 = a plataforma absorve.
  @IsOptional() @IsNumber() @Min(0) @Max(20)
  pixFee?: number
}
