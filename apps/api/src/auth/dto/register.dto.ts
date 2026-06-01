import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator'
import { UserRole } from '@prisma/client'

export class RegisterDto {
  @IsString()
  name: string

  @IsEmail()
  email: string

  @IsString()
  @IsOptional()
  phone?: string

  @IsString()
  @MinLength(6)
  password: string

  @IsString()
  @IsOptional()
  city?: string

  @IsString()
  @IsOptional()
  state?: string

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole
}
