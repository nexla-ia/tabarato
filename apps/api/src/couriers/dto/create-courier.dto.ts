import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import { IsCPF } from '../../common/validators/is-cpf.validator'

export class CreateCourierDto {
  // CPF validado pelos dígitos verificadores (não só a forma) — antes um CPF
  // estruturalmente válido mas falso (ex.: 123.456.789-00) passava.
  @IsString()
  @IsCPF()
  cpf: string

  // CNH: 9 a 11 dígitos (antes qualquer string ≤20, até vazia, era aceita).
  @IsString()
  @Matches(/^\d{9,11}$/, { message: 'CNH inválida.' })
  cnh: string

  // Placa: padrão antigo (ABC1234) ou Mercosul (ABC1D23).
  @IsString()
  @Matches(/^[A-Za-z]{3}-?\d[A-Za-z0-9]\d{2}$/, { message: 'Placa inválida.' })
  vehiclePlate: string

  // Tipo de veículo entre os aceitos (moto-only por ora) — antes qualquer string
  // ≤30, até vazia, era aceita.
  @IsIn(['moto', 'carro'], { message: 'Tipo de veículo inválido.' })
  vehicleType: string

  @IsOptional()
  @IsString()
  @MaxLength(140)
  pixKey?: string

  // Tipo da chave PIX — necessário pro repasse automático via Asaas.
  @IsOptional()
  @IsIn(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'])
  pixKeyType?: string

  // Documentos OBRIGATÓRIOS para cadastro — o admin precisa deles para aprovar o
  // entregador (antes eram opcionais, dava pra se cadastrar às cegas, sem nada
  // para conferir). A URL deve apontar para o bucket de documentos do Storage.
  @IsString()
  @MaxLength(500)
  cnhPhotoUrl: string

  @IsString()
  @MaxLength(500)
  identityPhotoUrl: string

  // Doc. do veículo OBRIGATÓRIO — plataforma é moto-only por ora. Sem ele o
  // vehicleDocStatus ficava null pra sempre e a auto-aprovação (que exige os 3
  // docs APPROVED) nunca disparava → entregador preso em PENDING.
  @IsString()
  @MaxLength(500)
  vehicleDocPhotoUrl: string
}
