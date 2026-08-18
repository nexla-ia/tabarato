import { BASE } from '@/lib/api'
import { Navbar } from '@/components/Navbar'
import { notFound } from 'next/navigation'
import { ProductClient } from './ProductClient'

async function getProduct(id: string) {
  try {
    const res = await fetch(`${BASE}/products/${id}`, { next: { revalidate: 30 } })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

async function getStore(id: string) {
  try {
    const res = await fetch(`${BASE}/stores/${id}`, { next: { revalidate: 30 } })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

async function getReviews(storeId: string) {
  try {
    const res = await fetch(`${BASE}/reviews/store/${storeId}?limit=6`, { next: { revalidate: 120 } })
    if (!res.ok) return { avgRating: null, total: 0, reviews: [] }
    return res.json()
  } catch { return { avgRating: null, total: 0, reviews: [] } }
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await getProduct(id)
  if (!product || !product.isActive) notFound()

  const store = await getStore(product.storeId)
  if (!store) notFound()

  const reviews = await getReviews(store.id)

  // "Você também pode gostar": outros produtos ativos da mesma loja — mesma
  // categoria primeiro. Não existe endpoint de relacionados nem review por
  // produto (só por loja/pedido), então a base é o catálogo que já veio
  // embutido em /stores/:id.
  const relatedProducts = (store.products ?? [])
    .filter((p: any) => p.isActive && p.id !== product.id)
    .sort((a: any, b: any) => {
      const aMatch = a.categoryId === product.categoryId ? 0 : 1
      const bMatch = b.categoryId === product.categoryId ? 0 : 1
      return aMatch - bMatch
    })
    .slice(0, 8)
    .map((p: any) => ({
      id: p.id, name: p.name, imageUrl: p.imageUrl, basePrice: p.basePrice, stock: p.stock,
    }))

  // WHITELIST: todos os endpoints usados aqui são públicos — só passamos campos
  // de EXIBIÇÃO ao cliente. Nunca serializar dados de bastidor (pixKey, cnpj,
  // ownerId, mp*) no HTML/RSC.
  const safeProduct = {
    id: product.id,
    name: product.name,
    description: product.description,
    imageUrl: product.imageUrl,
    basePrice: product.basePrice,
    stock: product.stock,
    hasVariations: product.hasVariations,
    category: product.category ? { id: product.category.id, name: product.category.name } : null,
    variations: (product.variations ?? []).map((v: any) => ({
      id: v.id, name: v.name, price: v.price, stock: v.stock,
    })),
  }
  const safeStore = {
    id: store.id,
    name: store.name,
    logoUrl: store.logoUrl,
    isOpen: store.isOpen,
    deliveryRadiusKm: store.deliveryRadiusKm,
    prepTimeMin: store.prepTimeMin,
  }

  return (
    <>
      <Navbar />
      <ProductClient
        product={safeProduct}
        store={safeStore}
        rating={reviews?.avgRating ?? null}
        reviewCount={reviews?.total ?? 0}
        reviews={reviews?.reviews ?? []}
        relatedProducts={relatedProducts}
      />
    </>
  )
}
