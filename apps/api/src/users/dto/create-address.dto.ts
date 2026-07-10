import { IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

export class CreateAddressDto {
  @IsString()
  @MaxLength(60)
  label: string

  @IsString()
  @MaxLength(150)
  street: string

  @IsString()
  @MaxLength(20)
  number: string

  @IsString()
  @IsOptional()
  @MaxLength(100)
  complement?: string

  @IsString()
  @MaxLength(100)
  district: string

  @IsString()
  @MaxLength(100)
  city: string

  @IsString()
  @MaxLength(2)
  state: string

  @IsString()
  @MaxLength(9)
  zipCode: string

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean
}
