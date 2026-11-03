import { IsInt, IsString, Length, Max, Min } from 'class-validator'

export class CreateAdDto {
  @IsString() @Length(2, 80)
  companyName: string

  // CPF ou CNPJ, com ou sem máscara. Os dígitos verificadores são conferidos no service.
  @IsString() @Length(11, 18)
  document: string

  // Arte já enviada por POST /uploads/image (só aceitamos URL do nosso bucket).
  @IsString()
  imageUrl: string

  @IsInt() @Min(1) @Max(90)
  days: number

  // Sem destino escolhível: o servidor liga o anúncio à loja do anunciante (ou a
  // nada). Versões antigas do app que mandem linkType/linkTarget têm o campo
  // descartado pelo whitelist do ValidationPipe.
}

export class RejectAdDto {
  @IsString() @Length(3, 300)
  reason: string
}
