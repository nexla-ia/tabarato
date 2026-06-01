import { IsArray, IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator'

export class CreateReviewDto {
  @IsString()
  orderId: string

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number

  @IsString()
  @IsOptional()
  comment?: string

  @IsArray()
  @IsUrl({}, { each: true })
  @IsOptional()
  photos?: string[]
}
