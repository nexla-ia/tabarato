import { UserRole } from './enums'

export interface User {
  id: string
  name: string
  email: string
  phone?: string
  role: UserRole
  avatarUrl?: string
  isActive: boolean
  createdAt: Date
}

export interface Address {
  id: string
  userId: string
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
