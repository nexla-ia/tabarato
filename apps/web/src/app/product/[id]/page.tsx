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

async function getMarketSuggestions(productCategoryId: string | null, excludeId: string) {
  if (!productCategoryId) return []
  try {
    const qs = new URLSearchParams({ productCategoryId, excludeId, limit: '10' })
    const res = await fetch(`${BASE}/products?${qs}`, { next: { revalidate: 60 } })
    if (!res.ok) return []
    return res.json()
  } catch { return [] }
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await getProduct(id)
  if (!product || !product.isActive) notFound()

  const [store, marketSuggestions] = await Promise.all([
    getStore(product.storeId),
    getMarketSuggestions(product.categoryId ?? null, product.id),
  ])
  if (!store) notFound()

  const reviews = await getReviews(store.id)

  // "Sugestões da loja": outros produtos ativos da MESMA loja — mesma categoria
  // primeiro. Não existe endpoint de relacionados por loja, então a base é o
  // catálogo que já veio embutido em /stores/:id.
  const storeSuggestions = (store.products ?? [])
    .filter((p: any) => p.isActive && p.id !== product.id)
    .sort((a: any, b: any) => {
      const aMatch = a.categoryId === product.categoryId ? 0 : 1
      const bMatch = b.categoryId === product.categoryId ? 0 : 1
      return aMatch - bMatch
    })
    .slice(0, 6)
    .map((p: any) => ({
      id: p.id, name: p.name, imageUrl: p.imageUrl, basePrice: p.basePrice, stock: p.stock,
    }))

  // "Sugestões de todas as lojas": mesma categoria de produto, em qualquer loja
  // aprovada (GET /products?productCategoryId=&excludeId=).
  const safeMarketSuggestions = (marketSuggestions ?? []).slice(0, 8).map((p: any) => ({
    id: p.id, name: p.name, imageUrl: p.imageUrl, basePrice: p.displayPrice ?? p.basePrice, stock: p.stock,
    storeName: p.store?.name ?? null,
  }))

  // WHITELIST: todos os endpoints usados aqui são públicos — só passamos campos
  // de EXIBIÇÃO ao cliente. Nunca serializar dados de bastidor (pixKey, cnpj,
  // ownerId, mp*) no HTML/RSC.
  const safeProduct = {
    id: product.id,
    name: product.name,
    description: product.description,
    imageUrl: product.imageUrl,
    images: product.images ?? [],
    basePrice: product.basePrice,
    stock: product.stock,
    hasVariations: product.hasVariations,
    promoBuyQty: product.promoBuyQty ?? null,
    promoPayQty: product.promoPayQty ?? null,
    avgRating: product.avgRating ?? null,
    reviewCount: product.reviewCount ?? 0,
    soldCount: product.soldCount ?? 0,
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
        storeRating={reviews?.avgRating ?? null}
        storeReviewCount={reviews?.total ?? 0}
        reviews={reviews?.reviews ?? []}
        storeSuggestions={storeSuggestions}
        marketSuggestions={safeMarketSuggestions}
      />
    </>
  )
}
