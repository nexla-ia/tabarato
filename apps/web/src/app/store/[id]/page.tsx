import { BASE } from '@/lib/api'
import { Navbar } from '@/components/Navbar'
import { notFound } from 'next/navigation'
import { StoreClient } from './StoreClient'

async function getStore(id: string) {
  const res = await fetch(`${BASE}/stores/${id}`, { next: { revalidate: 60 } })
  if (!res.ok) return null
  return res.json()
}

async function getProducts(storeId: string) {
  const res = await fetch(`${BASE}/products?storeId=${storeId}`, { next: { revalidate: 30 } })
  if (!res.ok) return []
  return res.json()
}

export default async function StorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [store, products] = await Promise.all([getStore(id), getProducts(id)])
  if (!store) notFound()

  return (
    <>
      <Navbar />
      <StoreClient store={store} products={products.filter((p: any) => p.isActive)} />
    </>
  )
}
