import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator'

export class UpdateCouponDto {
  @IsString()
  @IsOptional()
  code?: string

  @IsString()
  @IsOptional()
  description?: string

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  discountPercent?: number | null

  @IsNumber()
  @Min(0.01)
  @IsOptional()
  discountFixed?: number | null

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
