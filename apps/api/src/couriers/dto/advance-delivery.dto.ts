import { IsNumber, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min } from 'class-validator'

export class AdvanceDeliveryDto {
  // Comprovante de entrega — URL do bucket público (retorno do /uploads/image).
  // @IsUrl impede persistir string arbitrária que depois seria renderizada nos apps.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @IsUrl()
  photoUrl?: string

  // Código de entrega do cliente (6 dígitos). Só dígitos, tamanho limitado —
  // a proteção anti-brute-force real é o contador atômico no service.
  @IsOptional()
  @IsString()
  @Matches(/^\d{4,8}$/, { message: 'Código de entrega inválido.' })
  code?: string

  // Coords do entregador na hora de finalizar (cerca geográfica). Antes vinham sem
  // faixa — dava pra mandar qualquer número e furar a cerca do #1.
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number
}
