'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Star, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { ReviewsPage, Review } from '@/lib/types'
import { Spinner } from '@/components/Spinner'
import styles from './page.module.css'

function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} fill={i <= n ? '#F59E0B' : 'none'} color={i <= n ? '#F59E0B' : '#D6C9BF'} />
      ))}
    </span>
  )
}

function initials(name?: string) {
  return (name ?? '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

export default function AvaliacoesPage() {
  const [page, setPage] = useState(1)
  const reviewsQ = useQuery<ReviewsPage>({
    queryKey: ['store-reviews', page],
    queryFn: async () => (await api.get('/stores/my/reviews', { params: { page } })).data,
    placeholderData: (prev) => prev,
  })

  const data = reviewsQ.data
  const reviews = data?.reviews ?? []

  if (reviewsQ.isLoading) return <Spinner />

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Avaliações</h1>
      <p className={styles.subtitle}>O que os clientes acham da sua loja</p>

      <div className={styles.summaryCard}>
        <div className={styles.avgScore}>{data?.avgRating != null ? Number(data.avgRating).toFixed(1) : '—'}</div>
        <div className={styles.avgMeta}>
          {data?.avgRating != null && <Stars n={Math.round(data.avgRating)} size={16} />}
          <span className={styles.avgCount}>{data?.total ?? 0} avaliaç{data?.total === 1 ? 'ão' : 'ões'}</span>
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className={styles.empty}>
          <MessageSquare size={32} strokeWidth={1.5} />
          <p>Nenhuma avaliação ainda.</p>
        </div>
      ) : (
        <>
          <div className={styles.list}>
            {reviews.map((r: Review) => (
              <div key={r.id} className={styles.card}>
                <div className={styles.top}>
                  <span className={styles.avatar}>
                    {r.user?.avatarUrl ? <img src={r.user.avatarUrl} alt="" /> : initials(r.user?.name)}
                  </span>
                  <div className={styles.who}>
                    <div className={styles.name}>{r.user?.name ?? 'Cliente'}</div>
                    <div className={styles.date}>{new Date(r.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                  </div>
                  <Stars n={r.rating} />
                </div>
                {r.comment && <p className={styles.comment}>{r.comment}</p>}
                {r.photos && r.photos.length > 0 && (
                  <div className={styles.photos}>
                    {r.photos.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className={styles.photo}>
                        <img src={url} alt={`Foto ${i + 1}`} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {data && data.pages > 1 && (
            <div className={styles.pager}>
              <button className={styles.pagerBtn} onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
                <ChevronLeft size={15} /> Anterior
              </button>
              <span className={styles.pagerLabel}>Página {data.page} de {data.pages}</span>
              <button className={styles.pagerBtn} onClick={() => setPage((p) => p + 1)} disabled={page >= data.pages}>
                Próxima <ChevronRight size={15} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
