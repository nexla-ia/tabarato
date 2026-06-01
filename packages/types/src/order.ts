import { OrderStatus, PaymentMethod, PaymentStatus } from './enums'

export interface Order {
  id: string
  userId: string
  storeId: string
  addressId: string
  paymentId?: string
  subtotal: number
  deliveryFee: number
  total: number
  status: OrderStatus
  notes?: string
  refusalNote?: string
  createdAt: Date
  updatedAt: Date
}

export interface OrderItem {
  id: string
  orderId: string
  productId: string
  variationId?: string
  quantity: number
  unitPrice: number
  notes?: string
}

export interface Payment {
  id: string
  method: PaymentMethod
  gatewayId?: string
  status: PaymentStatus
  amount: number
  pixCode?: string
  pixExpiresAt?: Date
  paidAt?: Date
  createdAt: Date
}

export interface CartItem {
  productId: string
  variationId?: string
  quantity: number
  unitPrice: number
  notes?: string
}

export interface Cart {
  storeId: string
  items: CartItem[]
}
