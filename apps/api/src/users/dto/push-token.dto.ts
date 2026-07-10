import { IsString, MaxLength } from 'class-validator'

export class PushTokenDto {
  @IsString()
  @MaxLength(255)
  token: string
}
