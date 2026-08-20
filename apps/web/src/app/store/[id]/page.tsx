import { BASE } from '@/lib/api'
import { Navbar } from '@/components/Navbar'
import { notFound } from 'next/navigation'
import { StoreClient } from './StoreClient'

async function getStore(id: string) {
  try {
    const res = await fetch(`${BASE}/stores/${id}`, { next: { revalidate: 30 } })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

async function getReviews(id: string) {
  try {
    const res = await fetch(`${BASE}/reviews/store/${id}?limit=6`, { next: { revalidate: 120 } })
    if (!res.ok) return { avgRating: null, total: 0, reviews: [] }
    return res.json()
  } catch { return { avgRating: null, total: 0, reviews: [] } }
}

export default async function StorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [store, reviews] = await Promise.all([getStore(id), getReviews(id)])
  if (!store) notFound()

  // A API já retorna os produtos embutidos em /stores/:id.
  // WHITELIST: /stores/:id é público — só passamos campos de EXIBIÇÃO ao cliente.
  // Nunca serializar dados de bastidor (pixKey, cnpj, ownerId, userId, mp*) no HTML/RSC.
  const safeStore = {
    id: store.id,
    name: store.name,
    description: store.description,
    logoUrl: store.logoUrl,
    isOpen: store.isOpen,
    phone: store.phone,
    address: store.address,
    deliveryRadiusKm: store.deliveryRadiusKm,
    prepTimeMin: store.prepTimeMin,
  }
  const safeProducts = (store.products ?? [])
    .filter((p: any) => p.isActive)
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      imageUrl: p.imageUrl,
      basePrice: p.basePrice,
      stock: p.stock,
      isActive: p.isActive,
      promoBuyQty: p.promoBuyQty ?? null,
      promoPayQty: p.promoPayQty ?? null,
      category: p.category ? { id: p.category.id, name: p.category.name } : null,
      variations: (p.variations ?? []).map((v: any) => ({
        id: v.id, name: v.name, price: v.price, stock: v.stock, isActive: v.isActive,
      })),
    }))

  return (
    <>
      <Navbar />
      <StoreClient
        store={safeStore}
        products={safeProducts}
        rating={reviews?.avgRating ?? null}
        reviewCount={reviews?.total ?? 0}
        reviews={reviews?.reviews ?? []}
        photos={store.photos ?? []}
      />
    </>
  )
}
