import { Equals, IsBoolean, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'

export class CreateStoreDto {
  // CNPJ: 14 dígitos (aceita com ou sem máscara).
  @IsString()
  @Matches(/^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/, { message: 'CNPJ inválido.' })
  cnpj: string

  @IsString()
  @MaxLength(120)
  name: string

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(600)
  prepTimeMin?: number

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  deliveryRadiusKm?: number

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number

  @IsString()
  @MaxLength(250)
  address: string

  @IsString()
  @IsOptional()
  @MaxLength(140)
  pixKey?: string

  // Aceite dos Termos do Lojista — e o que registra a concordancia com a comissao.
  // OPCIONAL de proposito: o APK que ja esta em campo nao manda esse campo, e
  // recusar o cadastro dele seria quebrar quem nao atualizou. Quando vem, tem que
  // ser `true`; quando nao vem, a loja nasce sem aceite e o painel cobra depois
  // (mesmo caminho das lojas criadas antes desta migracao).
  @IsBoolean()
  @IsOptional()
  @Equals(true, { message: 'E preciso aceitar os Termos do Lojista para criar a loja.' })
  acceptedTerms?: boolean

  // Versao do texto que estava no ar na tela em que ele aceitou.
  @IsString()
  @IsOptional()
  @MaxLength(20)
  termsVersion?: string
}
