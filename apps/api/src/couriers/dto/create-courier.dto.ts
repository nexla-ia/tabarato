import { IsOptional, IsString, Matches, MaxLength } from 'class-validator'

export class CreateCourierDto {
  // CPF: 11 dígitos (aceita com ou sem máscara).
  @IsString()
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: 'CPF inválido.' })
  cpf: string

  @IsString()
  @MaxLength(20)
  cnh: string

  // Placa: padrão antigo (ABC1234) ou Mercosul (ABC1D23).
  @IsString()
  @Matches(/^[A-Za-z]{3}-?\d[A-Za-z0-9]\d{2}$/, { message: 'Placa inválida.' })
  vehiclePlate: string

  @IsString()
  @MaxLength(30)
  vehicleType: string

  @IsOptional()
  @IsString()
  @MaxLength(140)
  pixKey?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cnhPhotoUrl?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  identityPhotoUrl?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  vehicleDocPhotoUrl?: string
}
