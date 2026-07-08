import { Suspense } from 'react'
import Image from 'next/image'
import { Navbar } from '@/components/Navbar'
import { SearchBar } from '@/components/SearchBar'
import { CategoryRail } from './CategoryRail'
import { PromoStrip } from './PromoStrip'
import { PopularProducts } from './PopularProducts'
import { StoreGrid } from './StoreGrid'
import styles from './page.module.css'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string }>
}) {
  const { q, cat } = await searchParams
  const filtering = Boolean(q || cat)

  return (
    <>
      <Navbar />
      <main>
        {/* ── Hero ── */}
        <section className={styles.hero}>
          <div className={styles.heroGlow} />
          <div className={styles.heroBlob1} />
          <div className={styles.heroBlob2} />
          <div className={`container ${styles.heroInner}`}>
            <div className={styles.heroCopy}>
              <span className={styles.heroBadge}>🛵 Entrega no mesmo dia · Vilhena-RO</span>
              <h1 className={styles.heroTitle}>
                O comércio local<br />na palma da<span className={styles.heroTitleAccent}> sua mão</span>
              </h1>
              <p className={styles.heroSub}>
                Peça de restaurantes, lanchonetes e lojas da cidade e receba rapidinho em casa.
              </p>
              <Suspense fallback={<div className={styles.searchFallback} />}>
                <SearchBar />
              </Suspense>
            </div>
            <div className={styles.heroArt}>
              <Image src="/logo.png" alt="Tá Barato" width={280} height={280} priority className={styles.heroLogo} style={{ objectFit: 'contain' }} />
            </div>
          </div>
          <div className={styles.heroWave} />
        </section>

        <div className="container">
          <Suspense fallback={null}>
            <CategoryRail active={cat} />
          </Suspense>

          {!filtering && (
            <>
              <PromoStrip />
              <Suspense fallback={null}>
                <PopularProducts />
              </Suspense>
            </>
          )}

          <Suspense fallback={<div className={styles.loading}>Carregando lojas…</div>}>
            <StoreGrid q={q} cat={cat} />
          </Suspense>
        </div>

        {/* ── Footer ── */}
        <footer className={styles.footer}>
          <div className={`container ${styles.footerInner}`}>
            <div>
              <div className={styles.footerBrand}>Tá Barato</div>
              <p className={styles.footerText}>Marketplace local com entrega no mesmo dia em Vilhena, Rondônia.</p>
            </div>
            <div className={styles.footerCols}>
              <div className={styles.footerCol}>
                <span className={styles.footerColTitle}>Plataforma</span>
                <a href="/#lojas">Lojas</a>
                <a href="/login">Entrar</a>
                <a href="/register">Criar conta</a>
              </div>
              <div className={styles.footerCol}>
                <span className={styles.footerColTitle}>Para negócios</span>
                <a href="/cadastro-loja">Cadastre sua loja</a>
                <a href="/login">Painel do lojista</a>
              </div>
            </div>
          </div>
          <div className={styles.footerBottom}>
            <span>© 2026 Tá Barato · Vilhena-RO</span>
            <span>Feito com 🧡 no comércio local</span>
          </div>
        </footer>
      </main>
    </>
  )
}
