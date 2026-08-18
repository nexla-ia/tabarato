import { IsNumber, IsOptional, IsString, Min } from 'class-validator'

export class CreateProductDto {
  @IsString()
  categoryId: string

  @IsString()
  name: string

  @IsString()
  @IsOptional()
  description?: string

  @IsString()
  @IsOptional()
  imageUrl?: string

  @IsNumber()
  @IsOptional()
  @Min(0)
  basePrice?: number

  @IsNumber()
  @IsOptional()
  @Min(0)
  stock?: number
}
