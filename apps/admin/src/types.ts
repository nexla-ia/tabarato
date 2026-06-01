export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
}

export interface Stats {
  totalUsers: number
  pendingCouriers: number
  pendingStores: number
  totalOrders: number
}

export interface Courier {
  id: string
  userId: string
  cpf: string
  cnh: string
  vehiclePlate: string
  vehicleType: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
  isOnline: boolean
  rating: number
  cnhPhotoUrl: string | null
  identityPhotoUrl: string | null
  vehicleDocPhotoUrl: string | null
  cnhStatus: 'APPROVED' | 'REJECTED' | null
  identityStatus: 'APPROVED' | 'REJECTED' | null
  vehicleDocStatus: 'APPROVED' | 'REJECTED' | null
  photoUrl: string | null
  createdAt: string
  user: {
    name: string
    email: string
    phone: string | null
    avatarUrl: string | null
  }
}

export interface Store {
  id: string
  userId: string
  cnpj: string
  name: string
  description: string | null
  logoUrl: string | null
  phone: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
  address: string
  isOpen: boolean
  createdAt: string
  user: {
    name: string
    email: string
    phone: string | null
  }
  categories: { name: string }[]
}

export interface User {
  id: string
  name: string
  email: string
  phone: string | null
  role: 'CONSUMER' | 'STORE_OWNER' | 'COURIER' | 'ADMIN'
  isActive: boolean
  createdAt: string
}
