import { Suspense } from 'react'
import { Navbar } from '@/components/Navbar'
import { StoreGrid } from './StoreGrid'
import styles from './page.module.css'

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <section className={styles.hero}>
          <div className="container">
            <h1 className={styles.heroTitle}>Entrega na sua casa 🛵</h1>
            <p className={styles.heroSub}>Os melhores produtos do comércio local de Vilhena-RO entregues pra você</p>
          </div>
        </section>

        <div className="container">
          <Suspense fallback={<div className={styles.loading}>Carregando lojas...</div>}>
            <StoreGrid />
          </Suspense>
        </div>
      </main>
    </>
  )
}
