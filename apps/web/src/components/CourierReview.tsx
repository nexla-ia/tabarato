'use client'
import { useEffect, useState } from 'react'
import { Star, Check } from 'lucide-react'
import { api } from '@/lib/api'
import styles from './OrderReview.module.css'

// Avaliação do ENTREGADOR (separada da avaliação da loja). POST /courier-reviews,
// checa duplicata em /courier-reviews/check. Só aparece após entrega com entregador.
export function CourierReview({ orderId, courierName }: { orderId: string; courierName?: string }) {
  const [checked, setChecked] = useState(false)
  const [alreadyReviewed, setAlreadyReviewed] = useState(false)
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    api.get('/courier-reviews/check', { params: { orderId } })
      .then((r) => setAlreadyReviewed(!!r.data?.reviewed))
      .catch(() => {})
      .finally(() => setChecked(true))
  }, [orderId])

  async function submit() {
    if (rating < 1) { setError('Escolha de 1 a 5 estrelas.'); return }
    setSubmitting(true); setError('')
    try {
      await api.post('/courier-reviews', { orderId, rating, comment: comment.trim() || undefined })
      setDone(true)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Não foi possível enviar a avaliação.')
    } finally { setSubmitting(false) }
  }

  if (!checked) return null

  if (done || alreadyReviewed) {
    return (
      <div className={styles.thanks}>
        <span className={styles.thanksIcon}><Check size={18} /></span>
        <div>
          <p className={styles.thanksTitle}>{done ? 'Entregador avaliado!' : 'Você já avaliou o entregador'}</p>
          <p className={styles.thanksSub}>Obrigado pelo feedback sobre a entrega.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.review}>
      <p className={styles.prompt}>Como foi a entrega{courierName ? ` de ${courierName}` : ''}?</p>
      <div className={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHoverRating(n)}
            onMouseLeave={() => setHoverRating(0)}
            className={styles.starBtn}
          >
            <Star size={30} fill={n <= (hoverRating || rating) ? '#F59E0B' : 'none'} color={n <= (hoverRating || rating) ? '#F59E0B' : '#D6C9BF'} />
          </button>
        ))}
      </div>
      <textarea
        className={styles.textarea}
        placeholder="Comentário sobre o entregador (opcional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
        rows={2}
      />
      {error && <p className={styles.error}>{error}</p>}
      <button className={styles.submitBtn} onClick={submit} disabled={submitting || rating < 1}>
        {submitting ? 'Enviando…' : 'Enviar avaliação do entregador'}
      </button>
    </div>
  )
}
