import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator'

export class UpdateStoreDto {
  @IsString()
  @IsOptional()
  name?: string

  @IsString()
  @IsOptional()
  description?: string

  @IsString()
  @IsOptional()
  phone?: string

  @IsNumber()
  @IsOptional()
  prepTimeMin?: number

  @IsNumber()
  @IsOptional()
  deliveryRadiusKm?: number

  @IsNumber()
  @IsOptional()
  lat?: number

  @IsNumber()
  @IsOptional()
  lng?: number

  @IsString()
  @IsOptional()
  address?: string

  @IsString()
  @IsOptional()
  pixKey?: string

  @IsString()
  @IsOptional()
  logoUrl?: string

  @IsArray()
  @IsOptional()
  photos?: string[]

  @IsOptional()
  openingHours?: Record<string, any>
}
