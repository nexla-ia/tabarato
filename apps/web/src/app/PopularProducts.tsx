import Link from 'next/link'
import Image from 'next/image'
import { Flame } from 'lucide-react'
import { BASE } from '@/lib/api'
import styles from './PopularProducts.module.css'

interface PopProduct {
  id: string
  name: string
  imageUrl?: string | null
  basePrice: number | string
  storeId: string
  store?: { name?: string } | null
}

async function getPopular(): Promise<PopProduct[]> {
  try {
    const res = await fetch(`${BASE}/products/popular?limit=12`, { next: { revalidate: 120 } })
    if (!res.ok) return []
    return res.json()
  } catch { return [] }
}

function money(v: number | string) {
  return `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}`
}

export async function PopularProducts() {
  const products = await getPopular()
  if (!products.length) return null

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}><Flame size={20} className={styles.flame} /> Mais pedidos</h2>
        <span className={styles.sub}>O que Vilhena está pedindo agora</span>
      </div>

      <div className={`hideScroll ${styles.rail}`}>
        {products.map(p => (
          <Link key={p.id} href={`/store/${p.storeId}`} className={styles.card}>
            <div className={styles.imgWrap}>
              {p.imageUrl
                ? <Image src={p.imageUrl} alt={p.name} fill sizes="180px" style={{ objectFit: 'cover' }} />
                : <div className={styles.imgFallback}>🍽️</div>}
            </div>
            <div className={styles.body}>
              <div className={styles.name} title={p.name}>{p.name}</div>
              {p.store?.name && <div className={styles.store}>{p.store.name}</div>}
              <div className={styles.price}>{money(p.basePrice)}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
