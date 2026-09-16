import { IsInt, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator'

// Dados de KYC que faltam pra abrir a subconta Asaas da loja (o resto — nome, CNPJ,
// e-mail, telefone — vem do cadastro da loja/usuário).
export class AsaasOnboardDto {
  @IsString()
  @MaxLength(9)
  postalCode: string // CEP

  @IsString()
  @MaxLength(20)
  addressNumber: string

  @IsString()
  @MaxLength(120)
  province: string // bairro

  @IsInt()
  @IsPositive()
  @Min(1)
  incomeValue: number // faturamento/renda mensal estimada (exigido pelo Asaas)

  @IsString()
  @IsOptional()
  @MaxLength(30)
  companyType?: string // MEI | LIMITED | INDIVIDUAL | ASSOCIATION

  @IsString()
  @IsOptional()
  @MaxLength(200)
  address?: string // logradouro; se ausente, usa o endereço já cadastrado da loja

  @IsString()
  @IsOptional()
  @MaxLength(120)
  complement?: string
}
