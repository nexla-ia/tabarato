'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import styles from './AdCarousel.module.css'

interface LiveAd {
  id: string
  companyName: string
  imageUrl: string
  linkType: 'NONE' | 'STORE' | 'WHATSAPP' | 'URL'
  linkTarget: string | null
}

type Slide = { kind: 'ad'; ad: LiveAd } | { kind: 'house' }

const GIRO_MS = 5000
// Uma exibição por anúncio por visita — voltar o carrossel não infla a métrica.
const exibidos = new Set<string>()

function hrefDo(ad: LiveAd): string | null {
  if (ad.linkType === 'STORE' && ad.linkTarget) return `/store/${ad.linkTarget}`
  if (ad.linkType === 'WHATSAPP' && ad.linkTarget) return `https://wa.me/${ad.linkTarget}`
  if (ad.linkType === 'URL' && ad.linkTarget) return ad.linkTarget
  return null
}

/**
 * Anúncios pagos no topo da home, com vaga sobrando virando "Anuncie aqui".
 * Mesmo comportamento do carrossel do app.
 */
export function AdCarousel() {
  const router = useRouter()
  const { data } = useQuery<{ ads: LiveAd[]; showHouseAd: boolean }>({
    queryKey: ['ads', 'live'],
    queryFn: async () => (await api.get('/ads/live')).data,
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const slides: Slide[] = [
    ...(data?.ads ?? []).map((ad) => ({ kind: 'ad' as const, ad })),
    ...(data?.showHouseAd ? [{ kind: 'house' as const }] : []),
  ]
  const [atual, setAtual] = useState(0)
  const pausado = useRef(false)

  useEffect(() => {
    const s = slides[atual]
    if (s?.kind === 'ad' && !exibidos.has(s.ad.id)) {
      exibidos.add(s.ad.id)
      api.post(`/ads/${s.ad.id}/view`).catch(() => {})
    }
  }, [atual, slides.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (slides.length < 2) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => {
      if (!pausado.current) setAtual((i) => (i + 1) % slides.length)
    }, GIRO_MS)
    return () => clearInterval(t)
  }, [slides.length])

  if (slides.length === 0) return null
  const i = Math.min(atual, slides.length - 1)

  function clicar(ad: LiveAd) {
    api.post(`/ads/${ad.id}/click`).catch(() => {})
    const href = hrefDo(ad)
    if (!href) return
    if (href.startsWith('/')) router.push(href)
    else window.open(href, '_blank', 'noopener,noreferrer')
  }

  return (
    <section
      className={styles.wrap}
      aria-roledescription="carrossel"
      aria-label="Anúncios"
      onMouseEnter={() => { pausado.current = true }}
      onMouseLeave={() => { pausado.current = false }}
    >
      <div className={styles.janela}>
        <div className={styles.trilho} style={{ transform: `translateX(-${i * 100}%)` }}>
          {slides.map((s, idx) =>
            s.kind === 'ad' ? (
              <button
                key={s.ad.id}
                type="button"
                className={styles.slide}
                onClick={() => clicar(s.ad)}
                disabled={s.ad.linkType === 'NONE'}
                aria-hidden={idx !== i}
                tabIndex={idx === i ? 0 : -1}
                aria-label={`Anúncio de ${s.ad.companyName}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.ad.imageUrl} alt="" className={styles.arte} />
                <span className={styles.selo}>Patrocinado</span>
              </button>
            ) : (
              <Link
                key="house"
                href="/anunciar"
                className={`${styles.slide} ${styles.casa}`}
                aria-hidden={idx !== i}
                tabIndex={idx === i ? 0 : -1}
              >
                <span className={styles.casaBola} />
                <span className={styles.casaTexto}>
                  <span className={styles.casaKicker}>Sua empresa aqui</span>
                  <span className={styles.casaTitulo}>Apareça para toda Vilhena na tela inicial do Tá Barato</span>
                </span>
                <span className={styles.casaBtn}>Anunciar <ArrowRight size={15} /></span>
              </Link>
            ),
          )}
        </div>
        {slides.length > 1 && (
          <>
            <button type="button" className={`${styles.seta} ${styles.setaEsq}`} aria-label="Anterior"
              onClick={() => setAtual((n) => (n - 1 + slides.length) % slides.length)}>
              <ChevronLeft size={18} />
            </button>
            <button type="button" className={`${styles.seta} ${styles.setaDir}`} aria-label="Próximo"
              onClick={() => setAtual((n) => (n + 1) % slides.length)}>
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </div>
      {slides.length > 1 && (
        <div className={styles.pontos}>
          {slides.map((_, idx) => (
            <button
              key={idx} type="button" aria-label={`Ir para o anúncio ${idx + 1}`}
              className={`${styles.ponto} ${idx === i ? styles.pontoAtivo : ''}`}
              onClick={() => setAtual(idx)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
