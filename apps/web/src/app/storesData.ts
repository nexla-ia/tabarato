import { BASE } from '@/lib/api'

export interface StoreCategory { id: string; name: string; icon?: string | null }

export interface Store {
  id: string; name: string; description?: string; logoUrl?: string
  deliveryRadiusKm: number; prepTimeMin: number; isOpen: boolean
  rating?: number | null; mpConnected?: boolean
  categories?: StoreCategory[]
}

function sortStores(stores: Store[]): Store[] {
  // Aberta antes de fechada primeiro — é o que o cliente quer comprar AGORA.
  // "Verificada" (conectada ao Mercado Pago) só desempata dentro do mesmo
  // grupo aberto/fechado; antes vinha primeiro que aberto/fechado, então uma
  // loja fechada mas verificada furava na frente de lojas abertas sem MP.
  return stores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const open = Number(!!b.s.isOpen) - Number(!!a.s.isOpen)
      if (open) return open
      const verified = Number(!!b.s.mpConnected) - Number(!!a.s.mpConnected)
      if (verified) return verified
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
    const raw: any[] = await res.json()
    // Whitelist em runtime: só campos de EXIBIÇÃO viram props do client/HTML público.
    // Não depende do backend nunca vazar cnpj/pixKey/mp*/ownerId em /stores.
    const stores: Store[] = (raw ?? []).map((s) => ({
      id: s.id, name: s.name, description: s.description, logoUrl: s.logoUrl,
      deliveryRadiusKm: s.deliveryRadiusKm, prepTimeMin: s.prepTimeMin, isOpen: s.isOpen,
      rating: s.rating ?? null, mpConnected: !!s.mpConnected,
      categories: (s.categories ?? []).map((c: any) => ({ id: c.id, name: c.name, icon: c.icon ?? null })),
    }))
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
