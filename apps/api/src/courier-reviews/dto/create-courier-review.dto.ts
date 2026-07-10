import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator'

export class CreateCourierReviewDto {
  @IsUUID()
  orderId: string

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number

  @IsString()
  @IsOptional()
  @MaxLength(500)
  comment?: string
}
