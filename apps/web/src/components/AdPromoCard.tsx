'use client'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Megaphone, QrCode, CalendarDays, Clock, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { AdConfig, MyAd, brl, ctr, dataCurta } from '@/lib/ads'
import styles from './AdPromoCard.module.css'

/**
 * Janela de anúncio no painel do lojista — mesma lógica do card do app: no ar
 * mostra os números, aprovado lembra do PIX, sem anúncio convida a anunciar.
 */
export function AdPromoCard() {
  const { data: ads } = useQuery<MyAd[]>({
    queryKey: ['ads', 'mine'],
    queryFn: async () => (await api.get('/ads/mine')).data,
    staleTime: 60_000,
    retry: 1,
  })
  const { data: config } = useQuery<AdConfig>({
    queryKey: ['ads', 'config'],
    queryFn: async () => (await api.get('/ads/config')).data,
    staleTime: 10 * 60_000,
    retry: 1,
  })
  if (!ads) return null

  const noAr = ads.find((a) => a.live)
  const aPagar = ads.find((a) => a.status === 'AWAITING_PAYMENT')
  const emAnalise = ads.find((a) => a.status === 'PENDING_REVIEW')
  const agendado = ads.find((a) => a.status === 'PAID' && !a.live && a.startsAt && new Date(a.startsAt) > new Date())

  if (noAr) {
    return (
      <Link href="/meus-anuncios" className={styles.card}>
        <div className={styles.topo}>
          <span className={styles.vivo}><span className={styles.ponto} /> Anúncio no ar</span>
          <span className={styles.ate}>até {noAr.endsAt ? dataCurta(noAr.endsAt) : '—'}</span>
        </div>
        <dl className={styles.numeros}>
          <div><dt>exibições</dt><dd>{noAr.impressions.toLocaleString('pt-BR')}</dd></div>
          <div><dt>cliques</dt><dd>{noAr.clicks.toLocaleString('pt-BR')}</dd></div>
          <div><dt>taxa de clique</dt><dd>{ctr(noAr)}%</dd></div>
        </dl>
      </Link>
    )
  }

  if (aPagar || agendado || emAnalise) {
    const [Icone, titulo, sub] = aPagar
      ? [QrCode, 'Anúncio aprovado', `Pague o PIX de ${brl(aPagar.totalPrice)} para entrar no ar`] as const
      : agendado
        ? [CalendarDays, 'Anúncio agendado', `Entra no ar em ${dataCurta(agendado.startsAt!)}`] as const
        : [Clock, 'Anúncio em análise', 'Avisamos assim que a arte for aprovada'] as const
    return (
      <Link href="/meus-anuncios" className={`${styles.card} ${styles.linha}`}>
        <span className={styles.icone}><Icone size={20} /></span>
        <span className={styles.textos}><strong>{titulo}</strong><span>{sub}</span></span>
        <ChevronRight size={18} className={styles.seta} />
      </Link>
    )
  }

  return (
    <Link href="/anunciar" className={`${styles.card} ${styles.convite}`}>
      <span className={styles.bola} />
      <span className={styles.textos}>
        <span className={styles.kicker}>Vitrine do app</span>
        <strong>Coloque sua loja no topo da tela inicial</strong>
        {config && <span>A partir de {brl(config.pricePerDay)} por dia · paga só se aprovado</span>}
      </span>
      <span className={styles.conviteBtn}><Megaphone size={18} /> Anunciar</span>
    </Link>
  )
}
