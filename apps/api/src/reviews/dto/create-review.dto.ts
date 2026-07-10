import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator'

export class CreateReviewDto {
  @IsString()
  orderId: string

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number

  @IsString()
  @IsOptional()
  @MaxLength(500)
  comment?: string

  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  @IsOptional()
  photos?: string[]
}
