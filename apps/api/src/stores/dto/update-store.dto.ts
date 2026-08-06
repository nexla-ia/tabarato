import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator'

export class UpdateStoreDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string

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
  @IsOptional()
  @Min(-90)
  @Max(90)
  lat?: number

  @IsNumber()
  @IsOptional()
  @Min(-180)
  @Max(180)
  lng?: number

  @IsString()
  @IsOptional()
  @MaxLength(250)
  address?: string

  @IsString()
  @IsOptional()
  @MaxLength(140)
  pixKey?: string

  @IsString()
  @IsOptional()
  @MaxLength(500)
  logoUrl?: string

  // Documento da empresa (Cartão CNPJ / CCMEI) — URL do arquivo enviado.
  @IsString()
  @IsOptional()
  @MaxLength(500)
  documentUrl?: string

  @IsArray()
  @ArrayMaxSize(20)
  @IsUrl({}, { each: true })
  @IsOptional()
  photos?: string[]

  // openingHours é um ARRAY de 7 dias ({ open, from, to }), indexado por dia da
  // semana — é assim que o computeIsOpen lê (openingHours[dayOfWeek]).
  @IsArray()
  @ArrayMaxSize(7)
  @IsOptional()
  openingHours?: any[]

  // Feriados / dias fechados — array de { date, closed }.
  @IsArray()
  @ArrayMaxSize(366)
  @IsOptional()
  scheduleExceptions?: any[]

  // Limite de pedidos simultâneos (null = ilimitado).
  @IsInt()
  @Min(0)
  @Max(10000)
  @IsOptional()
  maxConcurrentOrders?: number | null

  // Categorias da loja (many-to-many). Enviar o conjunto COMPLETO — o service
  // faz `set`, substituindo as anteriores (permite adicionar E remover).
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsOptional()
  categoryIds?: string[]
}
