export interface User {
  id: string
  name: string
  email: string
  phone?: string
  role: string
  avatarUrl?: string
  city?: string
  state?: string
}

export interface Address {
  id: string
  label: string
  street: string
  number: string
  complement?: string
  district: string
  city: string
  state: string
  zipCode: string
  lat: number
  lng: number
  isDefault: boolean
}

export interface Category {
  id: string
  name: string
  icon?: string
}

export interface Store {
  id: string
  name: string
  description?: string
  logoUrl?: string
  address: string
  prepTimeMin: number
  deliveryRadiusKm: number
  isOpen: boolean
  rating?: number
  categories: Category[]
}

export interface ProductVariation {
  id: string
  name: string
  size?: string
  color?: string
  price: number
  stock: number
}

export interface Product {
  id: string
  name: string
  description?: string
  imageUrl?: string
  basePrice?: number
  stock?: number | null
  hasVariations: boolean
  isActive: boolean
  category: Category
  variations: ProductVariation[]
  promoBuyQty?: number | null
  promoPayQty?: number | null
}

export interface CartItem {
  product: Product
  variation?: ProductVariation
  quantity: number
  notes?: string
  storeId: string
  storeName: string
}

export interface OrderItem {
  id: string
  quantity: number
  unitPrice: number
  notes?: string
  product: { id: string; name: string; imageUrl?: string }
}

export interface Order {
  id: string
  status: string
  subtotal: number
  deliveryFee: number
  total: number
  notes?: string
  createdAt: string
  store: { id: string; name: string; logoUrl?: string }
  items: OrderItem[]
}
