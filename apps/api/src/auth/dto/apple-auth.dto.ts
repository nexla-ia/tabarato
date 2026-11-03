import { IsOptional, IsString, MaxLength } from 'class-validator'

export class AppleAuthDto {
  // identityToken devolvido pelo "Entrar com Apple" no iPhone.
  @IsString()
  identityToken: string

  // A Apple só manda o nome no PRIMEIRO login, e só para o app (não vai no token).
  @IsString()
  @IsOptional()
  @MaxLength(80)
  fullName?: string

  @IsString()
  @IsOptional()
  @MaxLength(20)
  referralCode?: string
}
