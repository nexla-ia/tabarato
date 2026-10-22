'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Package } from 'lucide-react'
import { BASE } from '@/lib/api'
import styles from './ProductGrid.module.css'

/**
 * Grade de produtos — o conteúdo principal da home, como já era no app.
 *
 * A web mostrava uma grade de LOJAS aqui; o app mostra ITENS. Era a maior
 * diferença entre os dois, e o motivo de parecerem produtos distintos. O
 * cartão repete o do app: imagem 1.15:1, etiqueta da loja sobre a foto, nome
 * em duas linhas e preço em laranja.
 *
 * Busca no cliente, e não no servidor, porque o filtro de categoria é estado
 * local da home — trocar de chip não pode recarregar a página.
 */

interface GridProduct {
  id: string
  name: string
  imageUrl?: string | null
  basePrice?: number | string | null
  comparePrice?: number | string | null
  displayPrice?: number | string | null
  store?: { id: string; name: string; isOpen?: boolean; rating?: number | string | null } | null
  storeId: string
}

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

export function ProductGrid({ categoryId }: { categoryId?: string }) {
  const [produtos, setProdutos] = useState<GridProduct[] | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    let cancelado = false
    setProdutos(null)
    setErro(false)

    const url = `${BASE}/products?limit=48${categoryId ? `&categoryId=${categoryId}` : ''}`
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!cancelado) setProdutos(d) })
      .catch(() => { if (!cancelado) setErro(true) })

    return () => { cancelado = true }
  }, [categoryId])

  if (erro) {
    return (
      <section className={styles.section}>
        <div className={styles.vazio}>
          <div className={styles.vazioTitulo}>Não foi possível carregar os itens</div>
          <p className={styles.vazioTexto}>Verifique a conexão e atualize a página.</p>
        </div>
      </section>
    )
  }

  // Esqueleto com a mesma forma do cartão: a página não "pula" quando carrega.
  if (produtos === null) {
    return (
      <section className={styles.section}>
        <div className={styles.head}>
          <h2 className={styles.titulo}>Todos os itens</h2>
        </div>
        <div className={styles.grid}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={styles.esqueleto} />
          ))}
        </div>
      </section>
    )
  }

  if (produtos.length === 0) {
    return (
      <section className={styles.section}>
        <div className={styles.vazio}>
          <div className={styles.vazioIcone}><Package size={30} /></div>
          <div className={styles.vazioTitulo}>Nenhum item encontrado</div>
          <p className={styles.vazioTexto}>Tente outra categoria.</p>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.titulo}>Todos os itens</h2>
          <p className={styles.sub}>Tudo que as lojas de Vilhena estão vendendo</p>
        </div>
        <span className={styles.contador}>{produtos.length}</span>
      </div>

      <div className={styles.grid}>
        {produtos.map((p) => {
          const por = Number(p.displayPrice ?? p.basePrice ?? 0)
          const de = p.comparePrice != null ? Number(p.comparePrice) : null
          const temOferta = de != null && de > por

          return (
            <Link key={p.id} href={`/store/${p.storeId}`} className={styles.card}>
              <div className={styles.imgWrap}>
                {p.imageUrl
                  ? <Image src={p.imageUrl} alt={p.name} fill sizes="(max-width:600px) 50vw, 220px" style={{ objectFit: 'cover' }} />
                  : <div className={styles.imgFallback}><Package size={28} /></div>}

                {temOferta && (
                  <span className={styles.selo}>−{Math.round(((de - por) / de) * 100)}%</span>
                )}

                {!!p.store?.name && (
                  <span className={styles.lojaTag}>
                    <span
                      className={styles.lojaDot}
                      style={{ background: p.store.isOpen ? '#4ADE80' : '#9CA3AF' }}
                    />
                    {p.store.name}
                  </span>
                )}
              </div>

              <div className={styles.corpo}>
                <div className={styles.nome}>{p.name}</div>
                <div className={styles.precos}>
                  {temOferta && <span className={styles.de}>{brl(de)}</span>}
                  <span className={styles.por}>{brl(por)}</span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
