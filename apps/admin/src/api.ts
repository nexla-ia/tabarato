import type { AuthUser, Courier, Stats, Store, User } from './types'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

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

  orders: (status?: string) =>
    request<any[]>(`/admin/orders${status ? `?status=${status}` : ''}`),
}
