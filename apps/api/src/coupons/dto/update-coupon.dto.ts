import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

export class UpdateCouponDto {
  @IsString()
  @IsOptional()
  @MaxLength(40)
  code?: string

  @IsString()
  @IsOptional()
  @MaxLength(200)
  description?: string

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  discountPercent?: number | null

  @IsNumber()
  @Min(0.01)
  @Max(1_000_000)
  @IsOptional()
  discountFixed?: number | null

  @IsBoolean()
  @IsOptional()
  freeShipping?: boolean

  @IsNumber()
  @Min(0)
  @IsOptional()
  minOrderValue?: number | null

  @IsNumber()
  @Min(1)
  @IsOptional()
  maxUses?: number | null

  @IsDateString()
  @IsOptional()
  expiresAt?: string | null

  @IsBoolean()
  @IsOptional()
  isActive?: boolean
}
