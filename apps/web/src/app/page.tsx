import { Suspense } from 'react'
import Image from 'next/image'
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
            <div className={styles.heroLogo}>
              <Image src="/logo.png" alt="Tá Barato" width={200} height={200} style={{ objectFit: 'contain' }} priority />
            </div>
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
