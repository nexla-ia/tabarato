import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { PaymentMethod } from '@prisma/client'

export class OrderItemDto {
  @IsString()
  productId: string

  @IsString()
  @IsOptional()
  variationId?: string

  @IsNumber()
  @Min(1)
  quantity: number

  @IsString()
  @IsOptional()
  notes?: string
}

export class CreateOrderDto {
  @IsString()
  storeId: string

  @IsString()
  addressId: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[]

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod

  @IsString()
  @IsOptional()
  notes?: string

  @IsString()
  @IsOptional()
  couponCode?: string
}
