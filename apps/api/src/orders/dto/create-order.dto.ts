import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { PaymentMethod } from '@prisma/client'

export class OrderItemDto {
  @IsString()
  productId: string

  @IsString()
  @IsOptional()
  variationId?: string

  @IsInt()
  @Min(1)
  @Max(1000)
  quantity: number

  @IsString()
  @IsOptional()
  @MaxLength(300)
  notes?: string
}

// Um grupo = itens (e cupom opcional) de UMA loja. O carrinho multi-loja envia
// vários grupos; o checkout cria 1 pedido por grupo, todos sob 1 pagamento.
export class StoreGroupDto {
  @IsString()
  storeId: string

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[]

  @IsString()
  @IsOptional()
  couponCode?: string
}

export class CreateOrderDto {
  // Formato multi-loja (preferido). Se ausente, cai no formato antigo (storeId+items).
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => StoreGroupDto)
  groups?: StoreGroupDto[]

  // ── Formato antigo (1 loja) — mantido por compatibilidade ──
  @IsString()
  @IsOptional()
  storeId?: string

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[]

  @IsString()
  addressId: string

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string

  @IsString()
  @IsOptional()
  couponCode?: string

  // Card payment fields (required when paymentMethod is CREDIT_CARD or DEBIT_CARD)
  @IsString()
  @IsOptional()
  cardToken?: string

  @IsNumber()
  @IsPositive()
  @Max(24)
  @IsOptional()
  installments?: number

  @IsString()
  @IsOptional()
  payerCpf?: string

  // Device fingerprint do MP (security.js) — reduz cc_rejected_high_risk no cartão.
  // O MP_DEVICE_SESSION_ID costuma passar de 200 chars, então o limite é folgado.
  @IsString()
  @IsOptional()
  @MaxLength(2048)
  deviceId?: string

  @IsString()
  @IsOptional()
  scheduledFor?: string // ISO date string

  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  @IsOptional()
  pointsToRedeem?: number // loyalty points to redeem (multiples of 100)

  @IsString()
  @IsOptional()
  @MaxLength(100)
  idempotencyKey?: string // evita pedido/cobrança duplicada em retry de rede
}
