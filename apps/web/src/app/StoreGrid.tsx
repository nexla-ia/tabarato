import { BASE } from '@/lib/api'
import Link from 'next/link'
import Image from 'next/image'
import styles from './StoreGrid.module.css'

interface Store {
  id: string; name: string; description?: string; logoUrl?: string
  deliveryRadiusKm: number; prepTimeMin: number; isOpen: boolean
}

async function getStores(): Promise<Store[]> {
  const res = await fetch(`${BASE}/stores`, { next: { revalidate: 60 } })
  if (!res.ok) return []
  return res.json()
}

function StarIcon() {
  return <span style={{ color: '#F59E0B', fontSize: 13 }}>★</span>
}

export async function StoreGrid() {
  const stores = await getStores()

  if (!stores.length) {
    return (
      <div className={styles.empty}>
        <p>Nenhuma loja disponível no momento. Volte em breve!</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className={styles.sectionTitle}>
        Lojas disponíveis <span className={styles.badge}>{stores.length}</span>
      </h2>
      <div className={styles.grid}>
        {stores.map(store => (
          <Link key={store.id} href={`/store/${store.id}`} className={styles.card}>
            <div className={styles.imgWrap}>
              {store.logoUrl ? (
                <Image src={store.logoUrl} alt={store.name} fill style={{ objectFit: 'cover' }} />
              ) : (
                <div className={styles.imgFallback}>🏪</div>
              )}
              <span className={`${styles.statusChip} ${store.isOpen ? styles.open : styles.closed}`}>
                {store.isOpen ? 'Aberto' : 'Fechado'}
              </span>
            </div>
            <div className={styles.info}>
              <h3 className={styles.name}>{store.name}</h3>
              {store.description && <p className={styles.desc} title={store.description}>{store.description}</p>}
              <div className={styles.meta}>
                <span>🕐 {store.prepTimeMin} min</span>
                <span>📍 até {store.deliveryRadiusKm} km</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
