import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { UserRole } from '@prisma/client'

export class RegisterDto {
  @IsString()
  @MaxLength(120)
  name: string

  @IsEmail()
  @MaxLength(180)
  email: string

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string

  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string

  @IsString()
  @IsOptional()
  @MaxLength(2)
  state?: string

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole
}
