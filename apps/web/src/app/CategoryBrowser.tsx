'use client'
import { useState } from 'react'
import { ScrollRail } from './ScrollRail'
import { StoreStrip } from './StoreStrip'
import { ProductGrid } from './ProductGrid'
import { emojiFor, sortCategoriesOutrosLast } from '@/lib/categoryIcons'
import { Store, StoreCategory } from './storesData'
import styles from './CategoryRail.module.css'

export function CategoryBrowser({ categories, stores, initialCat, children }: {
  categories: StoreCategory[]
  stores: Store[]
  initialCat?: string
  children?: React.ReactNode
}) {
  // Filtro por categoria é só estado local — troca de chip nunca navega/recarrega,
  // só refiltra a lista de lojas já carregada.
  const [activeCat, setActiveCat] = useState<string | undefined>(initialCat)
  const cats = sortCategoriesOutrosLast(categories)

  const visible = activeCat
    ? stores.filter((s) => s.categories?.some((c) => c.id === activeCat))
    : stores

  return (
    <>
      {cats.length > 0 && (
        <section className={styles.section}>
          <ScrollRail>
            <button
              type="button"
              className={`${styles.chip} ${!activeCat ? styles.chipActive : ''}`}
              onClick={() => setActiveCat(undefined)}
            >
              <span className={styles.emoji}>✨</span>
              <span>Todas</span>
            </button>
            {cats.map((c) => (
              <button
                type="button"
                key={c.id}
                className={`${styles.chip} ${activeCat === c.id ? styles.chipActive : ''}`}
                onClick={() => setActiveCat((prev) => (prev === c.id ? undefined : c.id))}
              >
                <span className={styles.emoji}>{emojiFor(c.icon)}</span>
                <span>{c.name}</span>
              </button>
            ))}
          </ScrollRail>
        </section>
      )}

      {/* Ordem portada do app: lojas como faixa secundária, depois os trilhos
          e, por fim, os ITENS como conteúdo principal. Antes a web terminava
          numa grade de lojas, que era a diferença mais visível entre os dois. */}
      <StoreStrip stores={visible} />

      {children}

      <ProductGrid categoryId={activeCat} />
    </>
  )
}
