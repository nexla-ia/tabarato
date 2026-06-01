import { CourierStatus, DeliveryStatus } from './enums'

export interface Courier {
  id: string
  userId: string
  cpf: string
  cnh: string
  vehiclePlate: string
  vehicleType: string
  photoUrl?: string
  status: CourierStatus
  isOnline: boolean
  currentLat?: number
  currentLng?: number
  rating: number
}

export interface Delivery {
  id: string
  orderId: string
  courierId: string
  distanceKm: number
  courierFee: number
  status: DeliveryStatus
  photoUrl?: string
  pickedUpAt?: Date
  deliveredAt?: Date
  createdAt: Date
}

export interface CourierLocation {
  courierId: string
  lat: number
  lng: number
  updatedAt: Date
}

export interface DeliveryFeeCalculation {
  distanceKm: number
  baseFee: number
  feePerKm: number
  total: number
}
