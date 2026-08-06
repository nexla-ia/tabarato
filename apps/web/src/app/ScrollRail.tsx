'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import styles from './CategoryRail.module.css'

export function ScrollRail({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  function update() {
    const el = ref.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  useEffect(() => {
    update()
    const el = ref.current
    if (!el) return
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  function scroll(dir: number) {
    ref.current?.scrollBy({ left: dir * 260, behavior: 'smooth' })
  }

  return (
    <div className={styles.railWrap}>
      {canLeft && (
        <button type="button" className={`${styles.railArrow} ${styles.railArrowLeft}`} onClick={() => scroll(-1)} aria-label="Rolar categorias para a esquerda">
          <ChevronLeft size={18} />
        </button>
      )}
      <div ref={ref} className={`hideScroll ${styles.rail}`}>
        {children}
      </div>
      {canRight && (
        <button type="button" className={`${styles.railArrow} ${styles.railArrowRight}`} onClick={() => scroll(1)} aria-label="Rolar categorias para a direita">
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  )
}
