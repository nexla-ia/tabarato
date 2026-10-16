import Link from 'next/link'
import Image from 'next/image'
import { BASE } from '@/lib/api'
import styles from './PopularProducts.module.css'
import extra from './ProductRail.module.css'

/**
 * Trilho horizontal de produtos da home.
 *
 * Generaliza o que "Mais pedidos" já fazia, para servir também às Ofertas
 * Imperdíveis e aos Destaques da Semana — três seções com o mesmo cartão e
 * regras de origem diferentes.
 *
 * Some sozinho quando a API devolve vazio. Importa para os Destaques da Semana:
 * a janela é de 7 dias e, com o volume de hoje, vai haver semana sem venda
 * nenhuma — e prateleira vazia é pior do que seção nenhuma.
 */

export interface RailProduct {
  id: string
  name: string
  imageUrl?: string | null
  basePrice: number | string
  comparePrice?: number | string | null
  descontoPct?: number
  storeId: string
  store?: { name?: string } | null
}

function money(v: number | string) {
  return `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}`
}

async function buscar(rota: string, limite: number): Promise<RailProduct[]> {
  try {
    // 120s: a home é estática e revalida sozinha. Oferta nova demora no máximo
    // dois minutos para aparecer, o que é aceitável e evita bater na API a cada
    // visita.
    const res = await fetch(`${BASE}${rota}?limit=${limite}`, { next: { revalidate: 120 } })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function ProductRail({
  rota,
  titulo,
  subtitulo,
  icone,
  limite = 12,
}: {
  rota: string
  titulo: string
  subtitulo: string
  icone: React.ReactNode
  limite?: number
}) {
  const produtos = await buscar(rota, limite)
  if (!produtos.length) return null

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>{icone} {titulo}</h2>
        <span className={styles.sub}>{subtitulo}</span>
      </div>

      <div className={`hideScroll ${styles.rail}`}>
        {produtos.map((p) => {
          const de = p.comparePrice != null ? Number(p.comparePrice) : null
          const por = Number(p.basePrice)
          const temOferta = de != null && de > por

          return (
            <Link key={p.id} href={`/store/${p.storeId}`} className={styles.card}>
              <div className={styles.imgWrap}>
                {p.imageUrl
                  ? <Image src={p.imageUrl} alt={p.name} fill sizes="180px" style={{ objectFit: 'cover' }} />
                  : <div className={styles.imgFallback}>🍽️</div>}
                {temOferta && (
                  <span className={extra.selo}>
                    −{p.descontoPct ?? Math.round(((de - por) / de) * 100)}%
                  </span>
                )}
              </div>
              <div className={styles.body}>
                <div className={styles.name} title={p.name}>{p.name}</div>
                {p.store?.name && <div className={styles.store}>{p.store.name}</div>}
                <div className={extra.precos}>
                  {temOferta && <span className={extra.de}>{money(de)}</span>}
                  <span className={styles.price}>{money(por)}</span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
