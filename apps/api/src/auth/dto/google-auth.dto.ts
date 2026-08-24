import { IsOptional, IsString, MaxLength } from 'class-validator'

export class GoogleAuthDto {
  // ID token retornado pelo Google Sign-In no app.
  @IsString()
  idToken: string

  // Código de indicação (opcional) — bônus é pago no 1º pedido entregue do indicado.
  @IsString()
  @IsOptional()
  @MaxLength(20)
  referralCode?: string
}
