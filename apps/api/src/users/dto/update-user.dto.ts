import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator'

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string

  // avatarUrl é servido a outros usuários (avaliações) — valida URL e limita tamanho.
  @IsUrl()
  @IsOptional()
  @MaxLength(2048)
  avatarUrl?: string

  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string

  @IsString()
  @IsOptional()
  @MaxLength(40)
  state?: string
}
