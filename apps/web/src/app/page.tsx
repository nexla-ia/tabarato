import { Suspense } from 'react'
import Image from 'next/image'
import { Navbar } from '@/components/Navbar'
import { CategoryBrowser } from './CategoryBrowser'
import { PromoStrip } from './PromoStrip'
import { PopularProducts } from './PopularProducts'
import { StoreGrid } from './StoreGrid'
import { getCategories, getStores } from './storesData'
import styles from './page.module.css'

// Categorias + lojas (sem filtro) pra navegação por categoria, que roda 100%
// no cliente depois disso — trocar de chip nunca recarrega a página.
async function CategoryBrowserSection({ cat }: { cat?: string }) {
  const [categories, stores] = await Promise.all([getCategories(), getStores()])
  return (
    <CategoryBrowser categories={categories} stores={stores} initialCat={cat}>
      <PromoStrip />
      <Suspense fallback={null}>
        <PopularProducts />
      </Suspense>
    </CategoryBrowser>
  )
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string }>
}) {
  const { q, cat } = await searchParams
  // Busca por texto colapsa pra "modo resultado" (esconde hero/categorias/promo).
  // Filtro por categoria NÃO — continua na mesma tela, só filtra a lista abaixo.
  const searching = Boolean(q)

  return (
    <>
      <Navbar />
      <main>
        {/* ── Hero — banner de marca. Busca mora na navbar (todas as páginas);
            aqui só aparece fora do modo busca (senão fica repetido/sem função
            logo abaixo da navbar). ── */}
        {!searching && (
          <section className={styles.hero}>
            <div className={styles.heroGlow} />
            <div className={styles.heroBlob1} />
            <div className={styles.heroBlob2} />
            <div className={`container ${styles.heroInner}`}>
              <div className={styles.heroArt}>
                <Image src="/logo.png" alt="Tá Barato" width={280} height={280} priority className={styles.heroLogo} style={{ objectFit: 'contain' }} />
              </div>
            </div>
            <div className={styles.heroWave} />
          </section>
        )}

        <div className="container">
          {!searching ? (
            <Suspense fallback={<div className={styles.loading}>Carregando lojas…</div>}>
              <CategoryBrowserSection cat={cat} />
            </Suspense>
          ) : (
            <Suspense fallback={<div className={styles.loading}>Carregando lojas…</div>}>
              <StoreGrid q={q} />
            </Suspense>
          )}
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
              <div className={styles.footerCol}>
                <span className={styles.footerColTitle}>Legal</span>
                <a href="/termos">Termos de Uso</a>
                <a href="/privacidade">Privacidade</a>
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
