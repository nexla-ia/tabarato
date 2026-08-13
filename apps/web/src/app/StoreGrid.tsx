import { getStores } from './storesData'
import { StoreCardsGrid } from './StoreCardsGrid'
import styles from './StoreGrid.module.css'

export async function StoreGrid({ q }: { q?: string }) {
  const stores = await getStores(q)

  return (
    <StoreCardsGrid
      heading={q ? <>Resultados para <span className={styles.term}>“{q}”</span></> : 'Lojas disponíveis'}
      stores={stores}
      filtering
    />
  )
}
