import { useCallback, useEffect, useState } from 'react'
import { api, type AdminAd, type AdStatus } from '../api'
import { useToast } from '../context/ToastContext'
import { ConfirmDialog } from '../components/ConfirmDialog'

const O = '#FF6600'
const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const BORDER = '#F0E8E0'
const CARD = '#FFFFFF'
const SANS = "'DM Sans', sans-serif"

type Filtro = 'PENDING_REVIEW' | 'AWAITING_PAYMENT' | 'PAID' | 'TODOS'

const FILTROS: { v: Filtro; label: string }[] = [
  { v: 'PENDING_REVIEW', label: 'Para aprovar' },
  { v: 'AWAITING_PAYMENT', label: 'Aguardando PIX' },
  { v: 'PAID', label: 'Pagos' },
  { v: 'TODOS', label: 'Todos' },
]

/** Fase visível: "No ar", "Agendado" e "Encerrado" são PAID + datas. */
function fase(a: AdminAd): { label: string; fg: string; bg: string } {
  const agora = Date.now()
  const M: Record<AdStatus, { label: string; fg: string; bg: string }> = {
    PENDING_REVIEW: { label: 'Para aprovar', fg: '#B45309', bg: '#FEF3C7' },
    AWAITING_PAYMENT: { label: 'Aguardando PIX', fg: '#C2410C', bg: '#FFEDD5' },
    REJECTED: { label: 'Recusado', fg: '#B91C1C', bg: '#FEE2E2' },
    EXPIRED_UNPAID: { label: 'Não pagou', fg: '#6B7280', bg: '#F3F4F6' },
    CANCELLED: { label: 'Cancelado', fg: '#6B7280', bg: '#F3F4F6' },
    PAID: { label: 'Pago', fg: '#15803D', bg: '#DCFCE7' },
  }
  if (a.status === 'PAID' && a.startsAt && a.endsAt) {
    const ini = new Date(a.startsAt).getTime()
    const fim = new Date(a.endsAt).getTime()
    if (ini <= agora && agora < fim) return { label: 'No ar', fg: '#15803D', bg: '#DCFCE7' }
    if (fim <= agora) return { label: 'Encerrado', fg: '#6B7280', bg: '#F3F4F6' }
    return { label: 'Agendado', fg: '#1D4ED8', bg: '#DBEAFE' }
  }
  return M[a.status]
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

function documento(d: string) {
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return d
}

function destino(a: AdminAd) {
  switch (a.linkType) {
    case 'STORE': return 'Loja do anunciante no app'
    case 'WHATSAPP': return `WhatsApp ${a.linkTarget ?? ''}`
    case 'URL': return a.linkTarget ?? ''
    default: return 'Só exibição (sem link)'
  }
}

/**
 * Anúncios pagos na vitrine. O trabalho do dia é a aba "Para aprovar": olhar a
 * arte como ela vai aparecer (3:1, com o selo "Patrocinado") e decidir. Recusar
 * pede motivo — a empresa recebe o texto e não foi cobrada.
 */
export function Anuncios() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<AdminAd[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('PENDING_REVIEW')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [recusando, setRecusando] = useState<AdminAd | null>(null)
  const [motivo, setMotivo] = useState('')
  const [cancelando, setCancelando] = useState<AdminAd | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setLoadError(false)
    try {
      setRows(await api.ads(filtro === 'TODOS' ? undefined : filtro))
    } catch {
      setLoadError(true)
      if (!silent) showToast('Erro ao carregar os anúncios', 'error')
    } finally {
      setLoading(false)
    }
  }, [filtro, showToast])

  useEffect(() => { load() }, [load])

  async function aprovar(a: AdminAd) {
    setOcupado(a.id)
    try {
      await api.approveAd(a.id)
      showToast(`Aprovado — ${a.companyName} recebeu o aviso para pagar`, 'success')
      await load(true)
    } catch (e) {
      showToast((e as Error).message || 'Não foi possível aprovar', 'error')
    } finally {
      setOcupado(null)
    }
  }

  async function confirmarRecusa() {
    if (!recusando || motivo.trim().length < 3) return
    setOcupado(recusando.id)
    try {
      await api.rejectAd(recusando.id, motivo.trim())
      showToast('Anúncio recusado e empresa avisada', 'success')
      setRecusando(null); setMotivo('')
      await load(true)
    } catch (e) {
      showToast((e as Error).message || 'Não foi possível recusar', 'error')
    } finally {
      setOcupado(null)
    }
  }

  async function confirmarCancelamento() {
    if (!cancelando) return
    setOcupado(cancelando.id)
    try {
      const r = await api.cancelAd(cancelando.id)
      showToast(r.refundNeeded ? 'Retirado do ar. Faça o estorno do PIX no painel do provedor.' : 'Anúncio cancelado', 'success')
      setCancelando(null)
      await load(true)
    } catch (e) {
      showToast((e as Error).message || 'Não foi possível cancelar', 'error')
    } finally {
      setOcupado(null)
    }
  }

  const btn = (bg: string, fg: string, borda?: string) => ({
    background: bg, color: fg, border: borda ? `1px solid ${borda}` : 'none', borderRadius: 9,
    padding: '8px 15px', fontSize: 13.5, fontWeight: 800 as const, cursor: 'pointer', fontFamily: SANS,
  })

  return (
    <div style={{ fontFamily: SANS, maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: TEXT, margin: 0 }}>Anúncios</h1>
        <button onClick={() => load()} style={btn(CARD, MUTED, BORDER)}>Atualizar</button>
      </div>
      <p style={{ fontSize: 13.5, color: MUTED, marginTop: 0, marginBottom: 18 }}>
        Banners pagos no topo da tela inicial. Aprovado, a empresa paga o PIX e o anúncio entra no ar sozinho.
        Preço, vagas e prazos ficam em Preços.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {FILTROS.map((f) => (
          <button
            key={f.v}
            onClick={() => setFiltro(f.v)}
            style={{
              padding: '8px 15px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
              border: `1.5px solid ${filtro === f.v ? O : BORDER}`,
              background: filtro === f.v ? '#FFF0E6' : CARD,
              color: filtro === f.v ? O : MUTED,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: MUTED, fontSize: 14 }}>Carregando…</div>
      ) : loadError ? (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 14.5, color: TEXT, fontWeight: 700, marginBottom: 4 }}>Não foi possível carregar</div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 14 }}>Verifique a conexão e tente de novo.</div>
          <button onClick={() => load()} style={btn(O, '#fff')}>Tentar novamente</button>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 28, textAlign: 'center', color: MUTED, fontSize: 14 }}>
          {filtro === 'PENDING_REVIEW' ? 'Nenhum anúncio esperando aprovação.' : 'Nenhum anúncio por aqui.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((a) => {
            const f = fase(a)
            const busy = ocupado === a.id
            const ctr = a.impressions > 0 ? ((a.clicks / a.impressions) * 100).toFixed(1).replace('.', ',') : '0'
            return (
              <div key={a.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
                {/* Arte como aparece no app: 3:1 com o selo */}
                <div style={{ position: 'relative', aspectRatio: '3 / 1', background: '#FFF0E6' }}>
                  <img src={a.imageUrl} alt={`Arte de ${a.companyName}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <span style={{
                    position: 'absolute', top: 10, left: 10, background: 'rgba(26,10,0,0.55)', color: '#fff',
                    fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '2px 7px', letterSpacing: '0.02em',
                  }}>Patrocinado</span>
                </div>

                <div style={{ padding: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15.5, fontWeight: 800, color: TEXT }}>{a.companyName}</span>
                      <span style={{ background: f.bg, color: f.fg, borderRadius: 20, padding: '3px 10px', fontSize: 11.5, fontWeight: 700 }}>{f.label}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
                      <div><strong style={{ color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{brl(a.totalPrice)}</strong> · {a.days} dias × {brl(a.pricePerDay)}</div>
                      <div>Nota fiscal: {documento(a.document)}</div>
                      <div>Ao tocar: {destino(a)}</div>
                      <div>Pedido por {a.user.name} · {a.user.email}{a.user.phone ? ` · ${a.user.phone}` : ''} · {data(a.createdAt)}</div>
                      {a.status === 'AWAITING_PAYMENT' && <div>Prazo para pagar: <strong style={{ color: TEXT }}>{data(a.payDeadline)}</strong></div>}
                      {a.status === 'PAID' && <div>No ar: <strong style={{ color: TEXT }}>{data(a.startsAt)} a {data(a.endsAt)}</strong> · pago em {data(a.paidAt)} via {a.payment?.gateway ?? '—'}</div>}
                      {a.status === 'REJECTED' && a.rejectReason && <div>Motivo da recusa: {a.rejectReason}</div>}
                    </div>
                    {a.status === 'PAID' && (
                      <div style={{ display: 'flex', gap: 18, marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>
                        {[[a.impressions.toLocaleString('pt-BR'), 'exibições'], [a.clicks.toLocaleString('pt-BR'), 'cliques'], [`${ctr}%`, 'taxa de clique']].map(([v, l]) => (
                          <div key={l}>
                            <div style={{ fontSize: 17, fontWeight: 800, color: O }}>{v}</div>
                            <div style={{ fontSize: 11.5, color: MUTED }}>{l}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {a.status === 'PENDING_REVIEW' && (
                      <>
                        <button onClick={() => aprovar(a)} disabled={busy} style={{ ...btn('#15803D', '#fff'), opacity: busy ? 0.6 : 1 }}>
                          {busy ? 'Salvando…' : 'Aprovar'}
                        </button>
                        <button onClick={() => { setRecusando(a); setMotivo('') }} disabled={busy} style={btn(CARD, '#B91C1C', '#FECACA')}>
                          Recusar
                        </button>
                      </>
                    )}
                    {(a.status === 'AWAITING_PAYMENT' || (a.status === 'PAID' && f.label !== 'Encerrado')) && (
                      <button onClick={() => setCancelando(a)} disabled={busy} style={btn(CARD, MUTED, BORDER)}>
                        {a.status === 'PAID' ? 'Tirar do ar' : 'Cancelar'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        aberto={!!recusando}
        titulo={`Recusar o anúncio de ${recusando?.companyName ?? ''}?`}
        consequencia="A empresa recebe o motivo por notificação e e-mail. Nada foi cobrado; ela pode enviar uma nova arte."
        rotuloConfirmar="Recusar anúncio"
        tom="aviso"
        carregando={!!recusando && ocupado === recusando.id}
        onConfirmar={confirmarRecusa}
        onCancelar={() => setRecusando(null)}
      >
        <label htmlFor="motivo-recusa" style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, display: 'block', marginBottom: 6 }}>
          Motivo (a empresa vai ler)
        </label>
        <textarea
          id="motivo-recusa"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: o texto está pequeno demais para ler no celular"
          rows={3}
          maxLength={300}
          style={{
            width: '100%', boxSizing: 'border-box', border: `1.5px solid ${BORDER}`, borderRadius: 9, padding: '9px 12px',
            fontSize: 13.5, color: TEXT, fontFamily: SANS, resize: 'vertical', marginBottom: 12,
          }}
        />
      </ConfirmDialog>

      <ConfirmDialog
        aberto={!!cancelando}
        titulo={cancelando?.status === 'PAID' ? `Tirar do ar o anúncio de ${cancelando?.companyName}?` : `Cancelar o anúncio de ${cancelando?.companyName ?? ''}?`}
        consequencia={cancelando?.status === 'PAID'
          ? <>O banner sai da vitrine na hora. <strong>O PIX já foi pago e não é devolvido automaticamente</strong> — faça o estorno no painel do provedor de pagamento e combine com a empresa.</>
          : 'O pedido é encerrado e o PIX deixa de valer. A empresa é avisada; nada foi cobrado.'}
        rotuloConfirmar={cancelando?.status === 'PAID' ? 'Tirar do ar' : 'Cancelar anúncio'}
        carregando={!!cancelando && ocupado === cancelando.id}
        onConfirmar={confirmarCancelamento}
        onCancelar={() => setCancelando(null)}
      />
    </div>
  )
}
