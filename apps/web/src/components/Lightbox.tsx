'use client'
import { useEffect } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import styles from './Lightbox.module.css'

export function Lightbox({ photos, index, alt, onClose, onNavigate }: {
  photos: string[]; index: number; alt: string
  onClose: () => void; onNavigate: (index: number) => void
}) {
  const current = photos[index]

  // Esc fecha, setas navegam.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onNavigate((index + 1) % photos.length)
      if (e.key === 'ArrowLeft') onNavigate((index - 1 + photos.length) % photos.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, photos.length, onClose, onNavigate])

  if (!current) return null

  return (
    <div className={styles.lightbox} onClick={onClose}>
      <button className={styles.lightboxClose} onClick={onClose} title="Fechar">
        <X size={22} />
      </button>
      {photos.length > 1 && (
        <button
          className={`${styles.lightboxNav} ${styles.lightboxPrev}`}
          onClick={(e) => { e.stopPropagation(); onNavigate((index - 1 + photos.length) % photos.length) }}
          title="Anterior"
        >
          <ChevronLeft size={26} />
        </button>
      )}
      <div className={styles.lightboxImgWrap} onClick={(e) => e.stopPropagation()}>
        <Image src={current} alt={alt} fill quality={95} sizes="90vw" style={{ objectFit: 'contain' }} />
      </div>
      {photos.length > 1 && (
        <button
          className={`${styles.lightboxNav} ${styles.lightboxNext}`}
          onClick={(e) => { e.stopPropagation(); onNavigate((index + 1) % photos.length) }}
          title="Próxima"
        >
          <ChevronRight size={26} />
        </button>
      )}
      {photos.length > 1 && (
        <div className={styles.lightboxCount}>{index + 1} / {photos.length}</div>
      )}
    </div>
  )
}
