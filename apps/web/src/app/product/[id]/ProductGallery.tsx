'use client'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, X, Package } from 'lucide-react'
import styles from './ProductGallery.module.css'

export function ProductGallery({ photos, alt, outOfStock }: { photos: string[]; alt: string; outOfStock?: boolean }) {
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const [zooming, setZooming] = useState(false)
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 })
  const imgWrapRef = useRef<HTMLDivElement>(null)

  const hasPhotos = photos.length > 0
  const current = hasPhotos ? photos[Math.min(active, photos.length - 1)] : null

  // Esc fecha, setas navegam — só enquanto o lightbox tá aberto.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
      if (e.key === 'ArrowRight') setActive((i) => (i + 1) % photos.length)
      if (e.key === 'ArrowLeft') setActive((i) => (i - 1 + photos.length) % photos.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, photos.length])

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = imgWrapRef.current?.getBoundingClientRect()
    if (!rect) return
    setZoomPos({
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    })
  }

  function next() { setActive((i) => (i + 1) % photos.length) }
  function prev() { setActive((i) => (i - 1 + photos.length) % photos.length) }

  return (
    <div className={styles.gallery}>
      {photos.length > 1 && (
        <div className={`hideScroll ${styles.thumbRail}`}>
          {photos.map((url, i) => (
            <button
              key={url + i}
              type="button"
              className={`${styles.thumb} ${i === active ? styles.thumbActive : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(i)}
            >
              <Image src={url} alt="" fill sizes="60px" style={{ objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}

      <div
        ref={imgWrapRef}
        className={styles.mainImg}
        onMouseEnter={() => setZooming(true)}
        onMouseLeave={() => setZooming(false)}
        onMouseMove={handleMouseMove}
        onClick={() => hasPhotos && setOpen(true)}
      >
        {current ? (
          <Image
            src={current}
            alt={alt}
            fill
            sizes="(max-width: 720px) 100vw, 420px"
            style={{
              objectFit: 'cover',
              transform: zooming ? 'scale(1.7)' : 'scale(1)',
              transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
              transition: zooming ? 'transform 0.05s linear' : 'transform 0.25s ease',
            }}
          />
        ) : (
          <div className={styles.mainImgFallback}><Package size={48} strokeWidth={1.2} /></div>
        )}
        {outOfStock && <span className={styles.outRibbon}>Esgotado</span>}
      </div>

      {open && current && (
        <div className={styles.lightbox} onClick={() => setOpen(false)}>
          <button className={styles.lightboxClose} onClick={() => setOpen(false)} title="Fechar">
            <X size={22} />
          </button>
          {photos.length > 1 && (
            <button
              className={`${styles.lightboxNav} ${styles.lightboxPrev}`}
              onClick={(e) => { e.stopPropagation(); prev() }}
              title="Anterior"
            >
              <ChevronLeft size={26} />
            </button>
          )}
          <div className={styles.lightboxImgWrap} onClick={(e) => e.stopPropagation()}>
            <Image src={current} alt={alt} fill sizes="90vw" style={{ objectFit: 'contain' }} />
          </div>
          {photos.length > 1 && (
            <button
              className={`${styles.lightboxNav} ${styles.lightboxNext}`}
              onClick={(e) => { e.stopPropagation(); next() }}
              title="Próxima"
            >
              <ChevronRight size={26} />
            </button>
          )}
          {photos.length > 1 && (
            <div className={styles.lightboxCount}>{active + 1} / {photos.length}</div>
          )}
        </div>
      )}
    </div>
  )
}
