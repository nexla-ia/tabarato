import { BASE } from '@/lib/api'
import { Navbar } from '@/components/Navbar'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import styles from './page.module.css'

interface Product {
  id: string; name: string; description?: string
  imageUrl?: string; basePrice?: number; isActive: boolean
}

async function getStore(id: string) {
  const res = await fetch(`${BASE}/stores/${id}`, { next: { revalidate: 60 } })
  if (!res.ok) return null
  return res.json()
}

async function getProducts(storeId: string): Promise<Product[]> {
  const res = await fetch(`${BASE}/products?storeId=${storeId}`, { next: { revalidate: 30 } })
  if (!res.ok) return []
  return res.json()
}

function fmtBRL(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}` }

export default async function StorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [store, products] = await Promise.all([getStore(id), getProducts(id)])
  if (!store) notFound()

  const active = products.filter(p => p.isActive)

  return (
    <>
      <Navbar />
      <main>
        {/* Store header */}
        <div className={styles.header}>
          <div className="container">
            <div className={styles.headerInner}>
              <div className={styles.logoWrap}>
                {store.logoUrl
                  ? <Image src={store.logoUrl} alt={store.name} width={80} height={80} style={{ borderRadius: 16, objectFit: 'cover' }} />
                  : <div className={styles.logoFallback}>🏪</div>
                }
              </div>
              <div className={styles.headerInfo}>
                <h1 className={styles.storeName}>{store.name}</h1>
                {store.description && <p className={styles.storeDesc}>{store.description}</p>}
                <div className={styles.storeMeta}>
                  <span className={`${styles.statusChip} ${store.isOpen ? styles.open : styles.closed}`}>
                    {store.isOpen ? '● Aberto' : '● Fechado'}
                  </span>
                  <span className={styles.metaItem}>🕐 {store.prepTimeMin} min</span>
                  <span className={styles.metaItem}>📍 até {store.deliveryRadiusKm} km</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Products */}
        <div className="container" style={{ padding: '32px 20px' }}>
          {active.length === 0 ? (
            <div className={styles.empty}>Nenhum produto disponível no momento.</div>
          ) : (
            <div className={styles.grid}>
              {active.map(p => (
                <div key={p.id} className={styles.productCard}>
                  <div className={styles.productImg}>
                    {p.imageUrl
                      ? <Image src={p.imageUrl} alt={p.name} fill style={{ objectFit: 'cover' }} />
                      : <div className={styles.productImgFallback}>📦</div>
                    }
                  </div>
                  <div className={styles.productInfo}>
                    <h3 className={styles.productName}>{p.name}</h3>
                    {p.description && <p className={styles.productDesc}>{p.description}</p>}
                    {p.basePrice != null && (
                      <p className={styles.productPrice}>{fmtBRL(p.basePrice)}</p>
                    )}
                    <button className={styles.addBtn}>+ Adicionar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
