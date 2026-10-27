import { IsString, IsUrl, MaxLength } from 'class-validator'

export class FundoBrancoDto {
  /** URL publica da foto ja enviada por POST /uploads/image. */
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(600)
  imageUrl: string
}
