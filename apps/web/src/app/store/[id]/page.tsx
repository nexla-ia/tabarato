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
    const res = await fetch(`${BASE}/reviews/store/${id}?limit=0`, { next: { revalidate: 120 } })
    if (!res.ok) return { avgRating: null, total: 0 }
    return res.json()
  } catch { return { avgRating: null, total: 0 } }
}

export default async function StorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [store, reviews] = await Promise.all([getStore(id), getReviews(id)])
  if (!store) notFound()

  // A API já retorna os produtos embutidos em /stores/:id
  const products = (store.products ?? []).filter((p: any) => p.isActive)

  return (
    <>
      <Navbar />
      <StoreClient
        store={store}
        products={products}
        rating={reviews?.avgRating ?? null}
        reviewCount={reviews?.total ?? 0}
      />
    </>
  )
}
