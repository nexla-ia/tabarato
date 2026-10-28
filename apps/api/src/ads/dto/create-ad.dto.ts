import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator'

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

  @IsOptional() @IsIn(['NONE', 'STORE', 'WHATSAPP', 'URL'])
  linkType?: 'NONE' | 'STORE' | 'WHATSAPP' | 'URL'

  @IsOptional() @IsString() @Length(1, 300)
  linkTarget?: string
}

export class RejectAdDto {
  @IsString() @Length(3, 300)
  reason: string
}
