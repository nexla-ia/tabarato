import { IsNumber, IsOptional, IsString, Min } from 'class-validator'

export class CreateVariationDto {
  @IsString()
  @IsOptional()
  sku?: string

  @IsString()
  name: string

  @IsString()
  @IsOptional()
  size?: string

  @IsString()
  @IsOptional()
  color?: string

  @IsNumber()
  @Min(0)
  price: number

  @IsNumber()
  @IsOptional()
  @Min(0)
  stock?: number
}
