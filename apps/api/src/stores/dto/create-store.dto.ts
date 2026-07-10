import { IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'

export class CreateStoreDto {
  // CNPJ: 14 dígitos (aceita com ou sem máscara).
  @IsString()
  @Matches(/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/, { message: 'CNPJ inválido.' })
  cnpj: string

  @IsString()
  @MaxLength(120)
  name: string

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(600)
  prepTimeMin?: number

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  deliveryRadiusKm?: number

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number

  @IsString()
  @MaxLength(250)
  address: string

  @IsString()
  @IsOptional()
  @MaxLength(140)
  pixKey?: string
}
