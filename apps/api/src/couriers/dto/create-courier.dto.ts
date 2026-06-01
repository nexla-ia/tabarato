import { IsOptional, IsString } from 'class-validator'

export class CreateCourierDto {
  @IsString()
  cpf: string

  @IsString()
  cnh: string

  @IsString()
  vehiclePlate: string

  @IsString()
  vehicleType: string

  @IsOptional()
  @IsString()
  cnhPhotoUrl?: string

  @IsOptional()
  @IsString()
  identityPhotoUrl?: string

  @IsOptional()
  @IsString()
  vehicleDocPhotoUrl?: string
}
