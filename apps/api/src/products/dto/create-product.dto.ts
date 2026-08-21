import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator'

export class CreateProductDto {
  @IsString()
  categoryId: string

  @IsString()
  @MaxLength(200)
  name: string

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string

  @IsString()
  @IsOptional()
  @MaxLength(2048)
  imageUrl?: string

  // Fotos adicionais da galeria (a imageUrl continua sendo a capa/thumbnail
  // usada nas listagens). Máx. 8 pra não virar upload infinito.
  @IsArray()
  @ArrayMaxSize(8)
  @IsUrl({}, { each: true })
  @IsOptional()
  images?: string[]

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1_000_000)
  basePrice?: number

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(10_000_000)
  stock?: number | null

  // Distância máxima de entrega deste produto (km). null = sem limite próprio.
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(1000)
  maxDeliveryKm?: number | null

  // Desconto progressivo "Leve X Pague Y". Enviar os dois juntos; null limpa a promoção.
  @IsInt()
  @IsOptional()
  @Min(2)
  promoBuyQty?: number | null

  @IsInt()
  @IsOptional()
  @Min(1)
  promoPayQty?: number | null
}
