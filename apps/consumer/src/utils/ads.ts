// Tipos e textos dos anúncios, compartilhados entre Anunciar, Meus anúncios e o
// card do painel da loja.

export type AdStatus = 'PENDING_REVIEW' | 'REJECTED' | 'AWAITING_PAYMENT' | 'EXPIRED_UNPAID' | 'PAID' | 'CANCELLED'
export type AdLinkType = 'NONE' | 'STORE' | 'WHATSAPP' | 'URL'

export interface MyAd {
  id: string
  companyName: string
  document: string
  imageUrl: string
  linkType: AdLinkType
  linkTarget: string | null
  days: number
  pricePerDay: number
  totalPrice: number
  status: AdStatus
  live: boolean
  rejectReason: string | null
  payDeadline: string | null
  paidAt: string | null
  startsAt: string | null
  endsAt: string | null
  impressions: number
  clicks: number
  createdAt: string
  pix: { code: string | null; qrBase64: string | null; expiresAt: string } | null
  projectedStartsAt?: string
  projectedEndsAt?: string
}

export interface AdConfig {
  pricePerDay: number
  minDays: number
  maxDays: number
  slots: number
  payDeadlineDays: number
  nextStart: string
}

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const dataCurta = (d: string | Date) =>
  new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

/** Fase que a pessoa enxerga. "No ar", "Agendado" e "Encerrado" saem de PAID + datas. */
export function faseDoAnuncio(ad: MyAd): { label: string; cor: string; fundo: string } {
  switch (ad.status) {
    case 'PENDING_REVIEW': return { label: 'Em análise', cor: '#B45309', fundo: '#FEF3C7' }
    case 'AWAITING_PAYMENT': return { label: 'Aprovado · falta pagar', cor: '#C2410C', fundo: '#FFEDD5' }
    case 'REJECTED': return { label: 'Não aprovado', cor: '#B91C1C', fundo: '#FEE2E2' }
    case 'EXPIRED_UNPAID': return { label: 'Prazo vencido', cor: '#6B7280', fundo: '#F3F4F6' }
    case 'CANCELLED': return { label: 'Cancelado', cor: '#6B7280', fundo: '#F3F4F6' }
    case 'PAID':
      if (ad.live) return { label: 'No ar', cor: '#15803D', fundo: '#DCFCE7' }
      if (ad.endsAt && new Date(ad.endsAt) <= new Date()) return { label: 'Encerrado', cor: '#6B7280', fundo: '#F3F4F6' }
      return { label: 'Agendado', cor: '#1D4ED8', fundo: '#DBEAFE' }
  }
}

/** Taxa de clique em %, com uma casa. */
export const ctr = (ad: Pick<MyAd, 'impressions' | 'clicks'>) =>
  ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(1).replace('.', ',') : '0'
