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

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await getProduct(id)
  if (!product || !product.isActive) notFound()

  const store = await getStore(product.storeId)
  if (!store) notFound()

  // WHITELIST: ambos endpoints são públicos — só passamos campos de EXIBIÇÃO ao
  // cliente. Nunca serializar dados de bastidor (pixKey, cnpj, ownerId, mp*) no HTML/RSC.
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
      <ProductClient product={safeProduct} store={safeStore} />
    </>
  )
}
