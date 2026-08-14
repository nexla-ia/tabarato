import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator'

export class CreateCouponDto {
  @IsString()
  code: string

  @IsString()
  @IsOptional()
  description?: string

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  discountPercent?: number

  @IsNumber()
  @Min(0.01)
  @IsOptional()
  discountFixed?: number

  // Cupom de frete grátis: a loja absorve a taxa de entrega (o cliente não paga).
  // Pode vir sozinho ou combinado com desconto no subtotal.
  @IsBoolean()
  @IsOptional()
  freeShipping?: boolean

  @IsNumber()
  @Min(0)
  @IsOptional()
  minOrderValue?: number

  @IsNumber()
  @Min(1)
  @IsOptional()
  maxUses?: number

  @IsDateString()
  @IsOptional()
  expiresAt?: string

  @IsBoolean()
  @IsOptional()
  isActive?: boolean
}
