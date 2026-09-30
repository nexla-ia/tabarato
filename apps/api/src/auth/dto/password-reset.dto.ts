import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator'

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(180)
  email: string
}

export class ResetPasswordDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(180)
  email: string

  @IsString()
  @Length(6, 6, { message: 'O código tem 6 dígitos.' })
  code: string

  @IsString()
  @MinLength(6, { message: 'A senha deve ter ao menos 6 caracteres.' })
  @MaxLength(72) // limite do bcrypt
  newPassword: string
}
