import { IsNumber, IsOptional, IsString } from 'class-validator'

export class CreateStoreDto {
  @IsString()
  cnpj: string

  @IsString()
  name: string

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
  lat: number

  @IsNumber()
  lng: number

  @IsString()
  address: string

  @IsString()
  @IsOptional()
  pixKey?: string
}
