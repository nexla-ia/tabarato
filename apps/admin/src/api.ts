import type { AuthUser, Courier, Stats, Store, User } from './types'

const BASE: string = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || '/api'

function getToken() {
  return localStorage.getItem('admin_token')
}

function getRefresh() {
  return localStorage.getItem('admin_refresh')
}

/**
 * Sessão expirada derruba para o login, em vez de deixar o painel inteiro
 * mostrando "erro ao carregar".
 *
 * O token do admin vale 7 dias e não há refresh. Sem isto, quando ele vence o
 * painel continua parecendo logado (nome e menu vêm do localStorage) e TODAS as
 * telas falham ao mesmo tempo — sintoma que parece queda da API, e não sessão
 * velha. Já custou um diagnóstico.
 *
 * Redireciona na mão porque o cliente HTTP não enxerga o router.
 */
/**
 * Renova o acesso com o refresh token (mesma rota que o app usa).
 *
 * Uma renovação por vez: se três telas tomarem 401 juntas, as três esperam a
 * mesma promessa em vez de disparar três refresh — o que invalidaria os tokens
 * umas das outras e derrubaria a sessão justamente ao tentar salvá-la.
 */
let renovando: Promise<boolean> | null = null

function renovarSessao(): Promise<boolean> {
  if (renovando) return renovando
  renovando = (async () => {
    const refreshToken = getRefresh()
    if (!refreshToken) return false
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!res.ok) return false
      const data = (await res.json()) as { accessToken?: string; refreshToken?: string }
      if (!data.accessToken) return false
      localStorage.setItem('admin_token', data.accessToken)
      if (data.refreshToken) localStorage.setItem('admin_refresh', data.refreshToken)
      return true
    } catch {
      return false
    } finally {
      // Libera a próxima tentativa só depois de concluída esta.
      setTimeout(() => { renovando = null }, 0)
    }
  })()
  return renovando
}

function onSessionExpired(): never {
  localStorage.removeItem('admin_token')
  localStorage.removeItem('admin_refresh')
  localStorage.removeItem('admin_user')
  if (!location.pathname.startsWith('/login')) {
    location.replace('/login?expirou=1')
  }
  throw new Error('Sua sessão expirou. Entre novamente.')
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const enviar = () => {
    const token = getToken()
    return fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...((options?.headers as Record<string, string>) ?? {}),
      },
    })
  }

  // Rotas de autenticação não entram no ciclo de renovação: o 401 do login é
  // senha errada, e tentar renovar a partir do refresh seria recursivo.
  const ehAuth = path.startsWith('/auth/')
  let res = await enviar()

  if (res.status === 401 && !ehAuth && getToken()) {
    res = (await renovarSessao()) ? await enviar() : onSessionExpired()
  }

  if (!res.ok) {
    if (res.status === 401 && !ehAuth) onSessionExpired()
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { message?: string }).message ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; refreshToken?: string; user: AuthUser }>('/auth/login', {
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

  setUserActive: (id: string, isActive: boolean) =>
    request<User>(`/admin/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    }),

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

  withdrawals: (status?: string) =>
    request<AdminWithdrawal[]>(`/admin/withdrawals${status ? `?status=${status}` : ''}`),

  bibleRequests: (status?: string) =>
    request<AdminBibleRequest[]>(`/admin/bible-requests${status ? `?status=${status}` : ''}`),

  updateBibleRequest: (id: string, body: { status?: string; notes?: string }) =>
    request<any>(`/admin/bible-requests/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

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

export interface AdminBibleRequest {
  id: string
  status: 'PENDING' | 'SENT' | 'CANCELLED'
  notes: string | null
  sentAt: string | null
  createdAt: string
  user: { id: string; name: string; email: string; phone: string | null }
  /** Nulo enquanto o cliente não cadastrar endereço — o pedido é feito antes disso. */
  address: { linha1: string; linha2: string; cep: string } | null
}

export interface AdminWithdrawal {
  id: string
  ownerType: 'STORE' | 'COURIER'
  ownerName: string | null
  amount: number | string
  pixKey: string
  pixKeyType: string | null
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'
  failReason: string | null
  asaasTransferId: string | null
  createdAt: string
  updatedAt: string
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
