'use client'
import { useEffect, useRef, useState } from 'react'
import { Star, Camera, X, Loader2, Check } from 'lucide-react'
import { api } from '@/lib/api'
import styles from './OrderReview.module.css'

const MAX_PHOTOS = 5

export function OrderReview({ orderId }: { orderId: string }) {
  const [checked, setChecked] = useState(false)
  const [alreadyReviewed, setAlreadyReviewed] = useState(false)
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.get(`/reviews/check/${orderId}`)
      .then((r) => setAlreadyReviewed(!!r.data?.reviewed))
      .catch(() => {})
      .finally(() => setChecked(true))
  }, [orderId])

  async function handlePhotoFile(file: File) {
    setError('')
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post<{ url: string }>('/uploads/image', formData)
      setPhotos((p) => [...p, data.url])
    } catch {
      setError('Não foi possível enviar a foto. Use JPEG, PNG ou WEBP de até 10MB.')
    } finally {
      setUploading(false)
    }
  }

  function removePhoto(url: string) {
    setPhotos((p) => p.filter((u) => u !== url))
  }

  async function handleSubmit() {
    if (rating < 1) { setError('Escolha uma nota de 1 a 5 estrelas'); return }
    setSubmitting(true)
    setError('')
    try {
      await api.post('/reviews', { orderId, rating, comment: comment.trim() || undefined, photos })
      setDone(true)
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Não foi possível enviar sua avaliação')
    } finally {
      setSubmitting(false)
    }
  }

  if (!checked) return null

  if (alreadyReviewed || done) {
    return (
      <div className={styles.thanks}>
        <span className={styles.thanksIcon}><Check size={18} /></span>
        <div>
          <p className={styles.thanksTitle}>{done ? 'Avaliação enviada!' : 'Você já avaliou este pedido'}</p>
          <p className={styles.thanksSub}>Obrigado por ajudar outros clientes a escolher melhor.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.review}>
      <p className={styles.prompt}>O que você achou da sua compra?</p>
      <div className={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = (hoverRating || rating) >= n
          return (
            <button
              key={n}
              type="button"
              className={styles.starBtn}
              onMouseEnter={() => setHoverRating(n)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => setRating(n)}
              title={`${n} estrela${n > 1 ? 's' : ''}`}
            >
              <Star size={30} fill={active ? '#F59E0B' : 'none'} color={active ? '#F59E0B' : '#D6C9BF'} />
            </button>
          )
        })}
      </div>

      <textarea
        className={styles.textarea}
        placeholder="Conte como foi sua experiência (opcional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
        rows={3}
      />

      <div className={styles.photoRow}>
        {photos.map((url) => (
          <div key={url} className={styles.photoThumb}>
            <img src={url} alt="" />
            <button type="button" className={styles.photoRemove} onClick={() => removePhoto(url)} title="Remover">
              <X size={11} />
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <>
            <input
              ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f); e.target.value = '' }}
            />
            <button
              type="button" className={styles.photoAdd}
              onClick={() => photoInputRef.current?.click()}
              disabled={uploading}
              title="Adicionar foto"
            >
              {uploading ? <Loader2 size={16} className={styles.spin} /> : <Camera size={16} />}
            </button>
          </>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <button className={styles.submitBtn} onClick={handleSubmit} disabled={submitting || rating < 1}>
        {submitting ? 'Enviando…' : 'Enviar avaliação'}
      </button>
    </div>
  )
}
