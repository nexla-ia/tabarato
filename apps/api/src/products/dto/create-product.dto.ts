import { ArrayMaxSize, IsArray, IsNumber, IsOptional, IsString, IsUrl, Min } from 'class-validator'

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
}
