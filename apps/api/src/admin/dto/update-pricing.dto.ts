import { IsNumber, IsOptional, Max, Min } from 'class-validator'

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
}
