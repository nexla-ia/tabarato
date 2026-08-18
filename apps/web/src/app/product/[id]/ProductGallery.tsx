'use client'
import { useRef, useState } from 'react'
import Image from 'next/image'
import { Package } from 'lucide-react'
import { Lightbox } from '@/components/Lightbox'
import styles from './ProductGallery.module.css'

export function ProductGallery({ photos, alt, outOfStock }: { photos: string[]; alt: string; outOfStock?: boolean }) {
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const [zooming, setZooming] = useState(false)
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 })
  const imgWrapRef = useRef<HTMLDivElement>(null)

  const hasPhotos = photos.length > 0
  const current = hasPhotos ? photos[Math.min(active, photos.length - 1)] : null

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = imgWrapRef.current?.getBoundingClientRect()
    if (!rect) return
    setZoomPos({
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    })
  }

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
        <Lightbox photos={photos} index={active} alt={alt} onClose={() => setOpen(false)} onNavigate={setActive} />
      )}
    </div>
  )
}
