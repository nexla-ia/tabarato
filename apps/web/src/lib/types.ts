// Tipos compartilhados da plataforma web (consumidor + lojista)

export interface Category {
  id: string
  name: string
  icon?: string | null
}

export interface DaySchedule {
  open: boolean
  from: string
  to: string
}

export type StoreStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'

export interface Store {
  id: string
  name: string
  description?: string | null
  logoUrl?: string | null
  status: StoreStatus
  isOpen: boolean
  isPaused?: boolean
  deliveryRadiusKm?: number | null
  openingHours?: DaySchedule[] | null
  address?: string | null
  phone?: string | null
  categories?: Category[]
}

export interface ProductVariation {
  id: string
  name: string
  price: number | string
  stock?: number | null
  isActive: boolean
}

export interface Product {
  id: string
  name: string
  description?: string | null
  basePrice: number | string
  imageUrl?: string | null
  stock?: number | null
  isActive: boolean
  categoryId?: string | null
  variations?: ProductVariation[]
}

export type OrderStatus =
  | 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY'
  | 'PICKED_UP' | 'DELIVERED' | 'CANCELLED'

export interface OrderItem {
  id: string
  quantity: number
  unitPrice: number | string
  notes?: string | null
  product?: { name: string } | null
  variation?: { name: string } | null
}

export interface Order {
  id: string
  status: OrderStatus
  subtotal: number | string
  deliveryFee: number | string
  discount: number | string
  total: number | string
  notes?: string | null
  scheduledFor?: string | null
  createdAt: string
  user?: { name: string; phone?: string | null } | null
  address?: { street?: string; number?: string; district?: string; city?: string; complement?: string | null } | null
  items?: OrderItem[]
  payment?: { method: string; status: string } | null
}

export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando', CONFIRMED: 'Confirmado', PREPARING: 'Preparando',
  READY: 'Pronto', PICKED_UP: 'Coletado', DELIVERED: 'Entregue', CANCELLED: 'Cancelado',
}

export const STATUS_COLOR: Record<string, string> = {
  PENDING: '#D97706', CONFIRMED: '#2563EB', PREPARING: '#7C3AED',
  READY: '#0891B2', PICKED_UP: '#059669', DELIVERED: '#16A34A', CANCELLED: '#DC2626',
}

// Próximo status que o lojista pode avançar
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: 'CONFIRMED', CONFIRMED: 'PREPARING', PREPARING: 'READY',
}

export const NEXT_STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  PENDING: 'Confirmar pedido', CONFIRMED: 'Iniciar preparo', PREPARING: 'Marcar como pronto',
}

export const PAYMENT_LABEL: Record<string, string> = {
  PIX: 'PIX', CREDIT_CARD: 'Crédito', DEBIT_CARD: 'Débito', WALLET: 'Carteira',
}

export function money(v: number | string | null | undefined): string {
  return `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}`
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
