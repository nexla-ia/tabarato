import Link from 'next/link'
import Image from 'next/image'
import { Clock, MapPin, Star, Store as StoreIcon, SearchX } from 'lucide-react'
import { Store } from './storesData'
import styles from './StoreGrid.module.css'

export function StoreCardsGrid({ heading, stores, filtering, onClear }: {
  heading: React.ReactNode
  stores: Store[]
  filtering: boolean
  /** Quando informado, o botão "Ver todas as lojas" limpa o filtro no cliente
   *  em vez de navegar (usado no filtro por categoria, que é local). */
  onClear?: () => void
}) {
  return (
    <div id="lojas" className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.sectionTitle}>{heading}</h2>
        {stores.length > 0 && <span className={styles.badge}>{stores.length}</span>}
      </div>

      {!stores.length ? (
        <div className={styles.empty}>
          {filtering ? <SearchX size={34} strokeWidth={1.5} /> : <StoreIcon size={34} strokeWidth={1.5} />}
          <p className={styles.emptyTitle}>
            {filtering ? 'Nada encontrado' : 'Nenhuma loja disponível ainda'}
          </p>
          <p className={styles.emptySub}>
            {filtering ? 'Tente outro termo ou categoria.' : 'Novas lojas de Vilhena chegam em breve. Volte logo!'}
          </p>
          {filtering && (
            onClear
              ? <button type="button" className={styles.emptyBtn} onClick={onClear}>Ver todas as lojas</button>
              : <Link href="/#lojas" className={styles.emptyBtn}>Ver todas as lojas</Link>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {stores.map((store, i) => (
            <Link
              key={store.id}
              href={`/store/${store.id}`}
              className={`${styles.card} reveal`}
              style={{ animationDelay: `${Math.min(i * 60, 480)}ms` }}
            >
              <div className={styles.imgWrap}>
                {store.logoUrl
                  ? <Image src={store.logoUrl} alt={store.name} fill sizes="(max-width:640px) 100vw, 380px" style={{ objectFit: 'cover' }} />
                  : <div className={styles.imgFallback}>🏪</div>}
                <span className={`${styles.statusChip} ${store.isOpen ? styles.open : styles.closed}`}>
                  <span className={styles.dot} /> {store.isOpen ? 'Aberto' : 'Fechado'}
                </span>
                {store.rating != null && store.rating > 0 && (
                  <span className={styles.ratingChip}><Star size={12} fill="#F59E0B" color="#F59E0B" /> {Number(store.rating).toFixed(1)}</span>
                )}
              </div>
              <div className={styles.info}>
                <h3 className={styles.name}>{store.name}</h3>
                {store.description && <p className={styles.desc} title={store.description}>{store.description}</p>}
                <div className={styles.meta}>
                  <span className={styles.metaItem}><Clock size={13} /> {store.prepTimeMin} min</span>
                  <span className={styles.metaDivider} />
                  <span className={styles.metaItem}><MapPin size={13} /> até {store.deliveryRadiusKm} km</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
