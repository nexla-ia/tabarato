import type { AuthUser, Courier, Stats, Store, User } from './types'

const BASE: string = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || '/api'

function getToken() {
  return localStorage.getItem('admin_token')
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options?.headers as Record<string, string>) ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { message?: string }).message ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  stats: () => request<Stats>('/admin/stats'),

  couriers: (status?: string) =>
    request<Courier[]>(`/admin/couriers${status ? `?status=${status}` : ''}`),

  updateCourierStatus: (id: string, status: string, note?: string) =>
    request<Courier>(`/admin/couriers/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, ...(note ? { note } : {}) }),
    }),

  updateCourierDocStatus: (id: string, document: 'cnh' | 'identity' | 'vehicle', status: 'APPROVED' | 'REJECTED') =>
    request<Courier>(`/admin/couriers/${id}/doc-status`, {
      method: 'PATCH',
      body: JSON.stringify({ document, status }),
    }),

  stores: (status?: string) =>
    request<Store[]>(`/admin/stores${status ? `?status=${status}` : ''}`),

  updateStoreStatus: (id: string, status: string) =>
    request<Store>(`/admin/stores/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  users: () => request<User[]>('/admin/users'),

  products: (search?: string, blocked?: 'true' | 'false') => {
    const q = new URLSearchParams()
    if (search) q.set('search', search)
    if (blocked) q.set('blocked', blocked)
    const qs = q.toString()
    return request<AdminProduct[]>(`/admin/products${qs ? `?${qs}` : ''}`)
  },
  setProductBlock: (id: string, blocked: boolean, reason?: string) =>
    request<{ id: string; blockedByAdmin: boolean; blockReason: string | null }>(`/admin/products/${id}/block`, {
      method: 'PATCH',
      body: JSON.stringify({ blocked, ...(reason ? { reason } : {}) }),
    }),

  orders: (status?: string) =>
    request<any[]>(`/admin/orders${status ? `?status=${status}` : ''}`),

  operations: () => request<Operations>('/admin/operations'),

  assignDelivery: (deliveryId: string, courierId: string) =>
    request<any>(`/admin/deliveries/${deliveryId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ courierId }),
    }),

  getSettings: () => request<Pricing>('/admin/settings'),
  updateSettings: (patch: Partial<Pricing>) =>
    request<Pricing>('/admin/settings', { method: 'PATCH', body: JSON.stringify(patch) }),
}

export interface AdminProduct {
  id: string
  name: string
  imageUrl: string | null
  basePrice: number | string | null
  isActive: boolean
  blockedByAdmin: boolean
  blockReason: string | null
  createdAt: string
  store: { id: string; name: string } | null
  category: { name: string } | null
}

export interface Pricing {
  deliveryBaseFee: number
  deliveryPerKm: number
  deliveryMinFee: number
  courierBaseFee: number
  courierPerKm: number
  platformCommissionPct: number
  // Acima deste valor de produtos, só retirada na loja (0 = sem limite).
  maxDeliveryValue: number
}

export interface OpWaiting {
  deliveryId: string
  orderId: string
  createdAt: string
  waitingMin: number
  courierFee: number | string
  store: { name: string; lat: number; lng: number } | null
  district: string | null
}
export interface OpActive {
  deliveryId: string
  orderId: string
  status: string
  store: { name: string } | null
  district: string | null
  courier: { id: string; name: string | null; lat: number | null; lng: number | null } | null
}
export interface OpCourier {
  id: string
  name: string | null
  lat: number | null
  lng: number | null
  updatedAt: string
  busy: boolean
}
export interface Operations {
  waiting: OpWaiting[]
  active: OpActive[]
  onlineCouriers: OpCourier[]
}
