import { IsEnum, IsOptional, IsString } from 'class-validator'
import { OrderStatus } from '@prisma/client'

export class UpdateStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus

  @IsString()
  @IsOptional()
  refusalNote?: string
}
