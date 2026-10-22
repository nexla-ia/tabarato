'use client'
import Link from 'next/link'
import Image from 'next/image'
import { ScrollRail } from './ScrollRail'
import { Store } from './storesData'
import styles from './StoreStrip.module.css'

/**
 * Faixa horizontal de lojas, no lugar da antiga grade de cartões.
 *
 * Porta a faixa que o app já tem: logo redonda de 60px, raio 18, bolinha de
 * status e o nome embaixo. O pedido do cliente era que web e app parecessem o
 * mesmo produto — e a diferença mais visível era esta, com a web dando à loja
 * o espaço que no app pertence ao item.
 *
 * Deliberadamente secundária: quem navega busca produto, e a loja é o caminho,
 * não o destino.
 */
export function StoreStrip({ stores }: { stores: Store[] }) {
  if (!stores.length) return null
  const abertas = stores.filter((s) => s.isOpen).length

  return (
    <section className={styles.strip} id="lojas">
      <div className={styles.head}>
        <h2 className={styles.title}>Lojas</h2>
        <span className={styles.sub}>
          {abertas} aberta{abertas !== 1 ? 's' : ''}
        </span>
      </div>

      <ScrollRail>
        {stores.map((s) => (
          <Link key={s.id} href={`/store/${s.id}`} className={styles.chip}>
            <span className={styles.logoWrap}>
              {s.logoUrl ? (
                <Image
                  src={s.logoUrl}
                  alt={s.name}
                  width={60}
                  height={60}
                  className={styles.logo}
                />
              ) : (
                <span className={styles.logoFallback}>{s.name[0]}</span>
              )}
              {/* Verde/cinza em vez da palavra "Fechado": a mesma decisão que
                  tomamos no app, para não assustar quem está só olhando. */}
              <span
                className={styles.dot}
                style={{ background: s.isOpen ? '#4ADE80' : '#9CA3AF' }}
                aria-label={s.isOpen ? 'Aberta agora' : 'Fechada agora'}
              />
            </span>
            <span className={styles.name}>{s.name}</span>
          </Link>
        ))}
      </ScrollRail>
    </section>
  )
}
