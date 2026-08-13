import { BASE } from '@/lib/api'

export interface StoreCategory { id: string; name: string; icon?: string | null }

export interface Store {
  id: string; name: string; description?: string; logoUrl?: string
  deliveryRadiusKm: number; prepTimeMin: number; isOpen: boolean
  rating?: number | null; mpConnected?: boolean
  categories?: StoreCategory[]
}

function sortStores(stores: Store[]): Store[] {
  // Verificada (conectada ao Mercado Pago, recebe pedido de verdade) primeiro,
  // depois aberta antes de fechada — mantém a ordem alfabética dentro de cada grupo.
  return stores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const verified = Number(!!b.s.mpConnected) - Number(!!a.s.mpConnected)
      if (verified) return verified
      const open = Number(b.s.isOpen) - Number(a.s.isOpen)
      if (open) return open
      return a.i - b.i
    })
    .map(({ s }) => s)
}

export async function getStores(q?: string): Promise<Store[]> {
  const qs = new URLSearchParams()
  if (q) qs.set('search', q)
  const url = `${BASE}/stores${qs.toString() ? `?${qs}` : ''}`
  try {
    const res = await fetch(url, { next: { revalidate: 60 } })
    if (!res.ok) return []
    const stores: Store[] = await res.json()
    return sortStores(stores)
  } catch { return [] }
}

export async function getCategories(): Promise<StoreCategory[]> {
  try {
    const res = await fetch(`${BASE}/stores/categories`, { next: { revalidate: 300 } })
    if (!res.ok) return []
    return res.json()
  } catch { return [] }
}
