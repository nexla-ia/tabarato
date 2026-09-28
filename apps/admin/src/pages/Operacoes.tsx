import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Operations, type OpWaiting, type OpCourier } from '../api'
import { useToast } from '../context/ToastContext'

const O = '#FF6600'
const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const BORDER = '#F0E8E0'
const CARD = '#FFFFFF'
const RED = '#DC2626'
const AMBER = '#D97706'
const GREEN = '#16A34A'
const SANS = "'DM Sans', sans-serif"

const DELIVERY_LABEL: Record<string, string> = {
  SEARCHING_COURIER: 'Procurando',
  COURIER_ASSIGNED: 'Atribuído',
  COURIER_HEADING_TO_STORE: 'Indo à loja',
  COURIER_AT_STORE: 'Na loja',
  PICKED_UP: 'Coletado',
  HEADING_TO_CLIENT: 'Indo ao cliente',
}

function fmtBRL(v: number | string) { return `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}` }
function minsAgo(iso: string) { return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)) }

function Tile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color, fontFamily: SANS, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12.5, color: MUTED, fontFamily: SANS, marginTop: 6, fontWeight: 600 }}>{label}</div>
    </div>
  )
}

// Centro de Vilhena-RO (fallback quando ainda não há pinos).
const VILHENA: [number, number] = [-12.7406, -60.1457]

export function Operacoes() {
  const { showToast } = useToast()
  const [data, setData] = useState<Operations | null>(null)
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<OpWaiting | null>(null)
  const [assignBusy, setAssignBusy] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  // Mapa ao vivo (Leaflet via CDN — window.L)
  const mapEl = useRef<HTMLDivElement | null>(null)
  const mapObj = useRef<any>(null)
  const layerRef = useRef<any>(null)
  const fitted = useRef(false)

  // Inicializa o mapa uma vez.
  useEffect(() => {
    const L = (window as any).L
    if (!L || !mapEl.current || mapObj.current) return
    const map = L.map(mapEl.current, { attributionControl: false }).setView(VILHENA, 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapObj.current = map
    // O contêiner pode ter tamanho 0 no 1º paint — recalcula após montar.
    setTimeout(() => map.invalidateSize(), 200)
    return () => { map.remove(); mapObj.current = null; layerRef.current = null }
  }, [])

  // Redesenha os pinos sempre que os dados atualizam (a cada 10s).
  useEffect(() => {
    const L = (window as any).L
    if (!L || !mapObj.current || !layerRef.current || !data) return
    const layer = layerRef.current
    layer.clearLayers()
    const pts: [number, number][] = []
    const dot = (lat: number, lng: number, fill: string, popup: string, radius = 8) => {
      L.circleMarker([lat, lng], { radius, color: '#fff', weight: 2, fillColor: fill, fillOpacity: 1 })
        .bindPopup(popup).addTo(layer)
      pts.push([lat, lng])
    }
    // Lojas de pedidos aguardando (âmbar; vermelho se atrasado ≥15min)
    for (const w of data.waiting) {
      if (w.store?.lat != null && w.store?.lng != null) {
        dot(w.store.lat, w.store.lng, w.waitingMin >= 15 ? '#DC2626' : '#D97706',
          `<b>${w.store.name ?? 'Loja'}</b><br/>Aguardando ${w.waitingMin} min → ${w.district ?? ''}`)
      }
    }
    // Entregadores online (verde = livre, azul = em entrega)
    for (const c of data.onlineCouriers) {
      if (c.lat != null && c.lng != null) {
        dot(c.lat, c.lng, c.busy ? '#2563EB' : '#16A34A',
          `<b>${c.name ?? 'Entregador'}</b><br/>${c.busy ? 'Em entrega' : 'Livre'}`, 7)
      }
    }
    // Enquadra nos pinos só na 1ª carga — depois respeita o zoom/pan do usuário.
    if (!fitted.current && pts.length) {
      try { mapObj.current.fitBounds(pts, { padding: [40, 40], maxZoom: 15 }) } catch { /* ignore */ }
      fitted.current = true
    }
  }, [data])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      setData(await api.operations())
    } catch {
      if (!silent) showToast('Erro ao carregar operação', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    load()
    timer.current = setInterval(() => load(true), 10_000) // atualiza a cada 10s
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [load])

  async function assign(courier: OpCourier) {
    if (!assigning) return
    setAssignBusy(courier.id)
    try {
      await api.assignDelivery(assigning.deliveryId, courier.id)
      showToast(`Atribuído a ${courier.name ?? 'entregador'}`, 'success')
      setAssigning(null)
      load(true)
    } catch (err) {
      showToast((err as Error).message || 'Erro ao atribuir', 'error')
    } finally {
      setAssignBusy(null)
    }
  }

  const freeCouriers = (data?.onlineCouriers ?? []).filter(c => !c.busy)

  return (
    <div style={{ fontFamily: SANS, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: TEXT, margin: 0 }}>Operação</h1>
        <button
          onClick={() => load()}
          style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '7px 14px', fontSize: 13, fontWeight: 700, color: MUTED, cursor: 'pointer', fontFamily: SANS }}
        >
          Atualizar
        </button>
      </div>
      <p style={{ fontSize: 13.5, color: MUTED, marginTop: 0, marginBottom: 20 }}>
        Ao vivo — atualiza a cada 10s.
      </p>

      {loading && !data ? (
        <div style={{ color: MUTED, fontSize: 14, padding: 40, textAlign: 'center' }}>Carregando…</div>
      ) : data ? (
        <>
          {/* Tiles */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <Tile label="Aguardando entregador" value={data.waiting.length} color={data.waiting.length > 0 ? AMBER : TEXT} />
            <Tile label="Em andamento" value={data.active.length} color={TEXT} />
            <Tile label="Entregadores online" value={data.onlineCouriers.length} color={data.onlineCouriers.length > 0 ? GREEN : RED} />
          </div>

          {/* Mapa ao vivo */}
          <div style={{ marginBottom: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
              <h2 style={{ fontSize: 13, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Mapa ao vivo</h2>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <Legend color={GREEN} label="Entregador livre" />
                <Legend color="#2563EB" label="Em entrega" />
                <Legend color={AMBER} label="Loja aguardando" />
                <Legend color={RED} label="Aguardando ≥15 min" />
              </div>
            </div>
            <div
              ref={mapEl}
              style={{ height: 380, width: '100%', borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden', background: '#EAE6E1' }}
            />
          </div>

          {/* Aguardando */}
          <Section title={`Pedidos aguardando entregador (${data.waiting.length})`}>
            {data.waiting.length === 0 ? (
              <Empty text="Nenhum pedido esperando. 🎉" />
            ) : (
              data.waiting.map(w => {
                const late = w.waitingMin >= 15
                return (
                  <div key={w.deliveryId} style={rowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>
                        {w.store?.name ?? 'Loja'} <span style={{ color: MUTED, fontWeight: 500 }}>→ {w.district ?? 'bairro não informado'}</span>
                      </div>
                      <div style={{ fontSize: 12.5, marginTop: 3, color: late ? RED : MUTED, fontWeight: late ? 700 : 500 }}>
                        Esperando há {w.waitingMin} min{late ? ' ⚠️' : ''} · Taxa {fmtBRL(w.courierFee)} · #{w.orderId.slice(0, 8)}
                      </div>
                    </div>
                    <button
                      onClick={() => setAssigning(w)}
                      style={{ background: O, color: '#fff', border: 'none', borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: SANS, flexShrink: 0 }}
                    >
                      Atribuir
                    </button>
                  </div>
                )
              })
            )}
          </Section>

          {/* Em andamento */}
          <Section title={`Entregas em andamento (${data.active.length})`}>
            {data.active.length === 0 ? (
              <Empty text="Nenhuma entrega em andamento." />
            ) : (
              data.active.map(a => (
                <div key={a.deliveryId} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>
                      {a.store?.name ?? 'Loja'} <span style={{ color: MUTED, fontWeight: 500 }}>→ {a.district ?? '—'}</span>
                    </div>
                    <div style={{ fontSize: 12.5, marginTop: 3, color: MUTED }}>
                      {a.courier?.name ?? 'Sem nome'} · #{a.orderId.slice(0, 8)}
                    </div>
                  </div>
                  <span style={{ background: '#EEF2FF', color: '#2563EB', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {DELIVERY_LABEL[a.status] ?? a.status}
                  </span>
                </div>
              ))
            )}
          </Section>

          {/* Online */}
          <Section title={`Entregadores online (${data.onlineCouriers.length})`}>
            {data.onlineCouriers.length === 0 ? (
              <Empty text="Nenhum entregador online agora." />
            ) : (
              data.onlineCouriers.map(c => (
                <div key={c.id} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>{c.name ?? 'Sem nome'}</div>
                    <div style={{ fontSize: 12.5, marginTop: 3, color: MUTED }}>
                      {c.lat != null && c.lng != null ? `Posição atualizada há ${minsAgo(c.updatedAt)} min` : 'Sem localização'}
                    </div>
                  </div>
                  <span style={{ background: c.busy ? '#FEF3C7' : '#DCFCE7', color: c.busy ? AMBER : GREEN, borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {c.busy ? 'Em entrega' : 'Livre'}
                  </span>
                </div>
              ))
            )}
          </Section>
        </>
      ) : null}

      {/* Modal de atribuição */}
      {assigning && (
        <div
          onClick={() => setAssigning(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: CARD, borderRadius: 16, padding: 22, width: 420, maxWidth: '100%', maxHeight: '80vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: TEXT, margin: '0 0 4px' }}>Atribuir entregador</h2>
            <p style={{ fontSize: 13, color: MUTED, marginTop: 0, marginBottom: 16 }}>
              {assigning.store?.name ?? 'Loja'} → {assigning.district ?? 'bairro não informado'}
            </p>
            {freeCouriers.length === 0 ? (
              <div style={{ fontSize: 13.5, color: MUTED, padding: '16px 0' }}>
                Nenhum entregador livre online no momento.
              </div>
            ) : (
              freeCouriers.map(c => (
                <div key={c.id} style={{ ...rowStyle, marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>{c.name ?? 'Sem nome'}</div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                      {c.lat != null ? `Localizado há ${minsAgo(c.updatedAt)} min` : 'Sem localização'}
                    </div>
                  </div>
                  <button
                    onClick={() => assign(c)}
                    disabled={assignBusy !== null}
                    style={{ background: O, color: '#fff', border: 'none', borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: SANS, opacity: assignBusy && assignBusy !== c.id ? 0.5 : 1, flexShrink: 0 }}
                  >
                    {assignBusy === c.id ? 'Atribuindo…' : 'Escolher'}
                  </button>
                </div>
              ))
            )}
            <button
              onClick={() => setAssigning(null)}
              style={{ marginTop: 14, width: '100%', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 9, padding: '9px', fontSize: 13.5, fontWeight: 700, color: MUTED, cursor: 'pointer', fontFamily: SANS }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
  padding: '12px 14px', marginBottom: 8,
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <h2 style={{ fontSize: 13, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>{title}</h2>
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 13.5, color: MUTED, padding: '14px 4px' }}>{text}</div>
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: MUTED, fontWeight: 600 }}>
      <span style={{ width: 12, height: 12, borderRadius: 6, background: color, border: '2px solid #fff', boxShadow: '0 0 0 1px #ddd' }} />
      {label}
    </span>
  )
}
