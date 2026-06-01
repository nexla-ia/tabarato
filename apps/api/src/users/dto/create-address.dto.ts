import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator'

export class CreateAddressDto {
  @IsString()
  label: string

  @IsString()
  street: string

  @IsString()
  number: string

  @IsString()
  @IsOptional()
  complement?: string

  @IsString()
  district: string

  @IsString()
  city: string

  @IsString()
  state: string

  @IsString()
  zipCode: string

  @IsNumber()
  lat: number

  @IsNumber()
  lng: number

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean
}
