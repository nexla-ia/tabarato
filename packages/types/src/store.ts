import { StoreStatus } from './enums'

export interface Store {
  id: string
  userId: string
  cnpj: string
  name: string
  description?: string
  logoUrl?: string
  phone?: string
  status: StoreStatus
  prepTimeMin: number
  deliveryRadiusKm: number
  lat: number
  lng: number
  address: string
  isOpen: boolean
  createdAt: Date
}

export interface Product {
  id: string
  storeId: string
  categoryId: string
  name: string
  description?: string
  imageUrl?: string
  hasVariations: boolean
  basePrice?: number
  stock?: number
  isActive: boolean
}

export interface ProductVariation {
  id: string
  productId: string
  sku?: string
  name: string
  size?: string
  color?: string
  price: number
  stock: number
  isActive: boolean
}

export interface Category {
  id: string
  name: string
  icon?: string
  sortOrder: number
}
