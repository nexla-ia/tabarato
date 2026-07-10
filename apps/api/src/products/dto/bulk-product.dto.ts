import { IsArray, ArrayNotEmpty, ArrayMaxSize, IsUUID, IsBoolean, IsOptional, IsNumber, IsInt, Min, Max } from 'class-validator'

export class BulkToggleDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  productIds!: string[]

  @IsBoolean()
  active!: boolean
}

export class BulkUpdateDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  productIds!: string[]

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  basePrice?: number

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock?: number

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
