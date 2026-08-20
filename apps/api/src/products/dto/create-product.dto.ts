import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, IsString, IsUrl, Min } from 'class-validator'

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
  basePrice?: number

  @IsNumber()
  @IsOptional()
  @Min(0)
  stock?: number

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
