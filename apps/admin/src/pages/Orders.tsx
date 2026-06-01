import { useEffect, useState } from 'react'
import { api } from '../api'

type OrderStatus = 'ALL' | 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED'

const O = '#FF6600'
const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const BORDER = '#F0E8E0'
const BG = '#FFFBF7'
const SANS = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

const STATUS_COLOR: Record<string, string> = {
  PENDING:   '#D97706',
  CONFIRMED: '#2563EB',
  PREPARING: '#7C3AED',
  READY:     '#0891B2',
  PICKED_UP: '#059669',
  DELIVERED: '#16A34A',
  CANCELLED: '#DC2626',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING:   'Aguardando',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Preparando',
  READY:     'Pronto',
  PICKED_UP: 'Coletado',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
}

const PAYMENT_LABEL: Record<string, string> = {
  PIX: 'PIX', CREDIT_CARD: 'Crédito', DEBIT_CARD: 'Débito', WALLET: 'Carteira',
}

const FILTERS: { key: OrderStatus; label: string }[] = [
  { key: 'ALL',       label: 'Todos'      },
  { key: 'PENDING',   label: 'Aguardando' },
  { key: 'CONFIRMED', label: 'Confirmados'},
  { key: 'PREPARING', label: 'Preparando' },
  { key: 'READY',     label: 'Prontos'    },
  { key: 'DELIVERED', label: 'Entregues'  },
  { key: 'CANCELLED', label: 'Cancelados' },
]

interface Order {
  id: string
  status: string
  total: number
  subtotal: number
  deliveryFee: number
  discount: number
  notes?: string
  createdAt: string
  user: { name: string; email: string; phone?: string }
  store: { name: string }
  payment?: { method: string; status: string; amount: number }
  delivery?: { status: string; distanceKm: number; courierFee: number; courier?: { user: { name: string } } }
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function fmtBRL(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}` }

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? '#888'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 20,
      background: color + '18', color, fontWeight: 700, fontSize: 11.5,
      fontFamily: SANS, whiteSpace: 'nowrap' as const,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 3, background: color, display: 'inline-block' }} />
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState<OrderStatus>('ALL')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Order | null>(null)

  useEffect(() => {
    setLoading(true)
    const q = filter !== 'ALL' ? `?status=${filter}` : ''
    api.get(`/admin/orders${q}`)
      .then(r => setOrders(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filter])

  const filtered = orders.filter(o =>
    search
      ? o.user.name.toLowerCase().includes(search.toLowerCase()) ||
        o.store.name.toLowerCase().includes(search.toLowerCase()) ||
        o.id.toLowerCase().includes(search.toLowerCase())
      : true
  )

  return (
    <div style={{ fontFamily: SANS, color: TEXT }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>Pedidos</h1>
        <p style={{ margin: '4px 0 0', color: MUTED, fontSize: 14 }}>{orders.length} pedidos encontrados</p>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' as const, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 13, fontFamily: SANS, fontWeight: filter === f.key ? 700 : 500,
              background: filter === f.key ? O : '#F0E8E0',
              color: filter === f.key ? '#fff' : MUTED,
              transition: 'all 0.12s',
            }}>
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por cliente, loja ou ID..."
          style={{
            flex: 1, minWidth: 200, padding: '8px 14px', borderRadius: 10,
            border: `1.5px solid ${BORDER}`, fontSize: 13.5, fontFamily: SANS, outline: 'none',
            background: '#fff', color: TEXT,
          }}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center' as const, padding: 60, color: MUTED, fontFamily: SANS }}>Carregando...</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
            <thead>
              <tr style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}>
                {['ID', 'Cliente', 'Loja', 'Total', 'Pagamento', 'Entregador', 'Status', 'Data'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left' as const, fontSize: 11,
                    fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: 'uppercase' as const,
                    fontFamily: SANS, whiteSpace: 'nowrap' as const,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, i) => (
                <tr
                  key={o.id}
                  onClick={() => setSelected(o)}
                  style={{
                    cursor: 'pointer',
                    borderBottom: i < filtered.length - 1 ? `1px solid ${BORDER}` : undefined,
                    background: selected?.id === o.id ? `${O}08` : 'transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (selected?.id !== o.id) (e.currentTarget as HTMLElement).style.background = '#FFF8F3' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selected?.id === o.id ? `${O}08` : 'transparent' }}
                >
                  <td style={{ padding: '12px 14px', fontFamily: MONO, fontSize: 12, color: MUTED }}>
                    #{o.id.slice(0, 8)}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 13.5, fontWeight: 600 }}>
                    {o.user.name}
                    <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 400, marginTop: 1 }}>{o.user.phone ?? o.user.email}</div>
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 13.5 }}>{o.store.name}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13.5, fontWeight: 700 }}>{fmtBRL(o.total)}</td>
                  <td style={{ padding: '12px 14px', fontSize: 13 }}>
                    {o.payment ? PAYMENT_LABEL[o.payment.method] ?? o.payment.method : '—'}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: 13 }}>
                    {o.delivery?.courier?.user.name ?? (o.delivery ? 'Buscando...' : '—')}
                  </td>
                  <td style={{ padding: '12px 14px' }}><StatusBadge status={o.status} /></td>
                  <td style={{ padding: '12px 14px', fontSize: 12, color: MUTED, whiteSpace: 'nowrap' as const }}>
                    {fmtDate(o.createdAt)}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 40, textAlign: 'center' as const, color: MUTED, fontSize: 14, fontFamily: SANS }}>
                    Nenhum pedido encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(26,10,0,0.45)', zIndex: 50,
            display: 'flex', justifyContent: 'flex-end',
          }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{
              width: 400, height: '100%', background: '#fff', overflowY: 'auto' as const,
              padding: 28, boxShadow: '-8px 0 40px rgba(0,0,0,0.12)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO, letterSpacing: 0.5 }}>#{selected.id.slice(0, 8)}</div>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{selected.store.name}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{
                background: '#F0E8E0', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: MUTED,
              }}>×</button>
            </div>

            <StatusBadge status={selected.status} />

            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
              <Row label="Cliente" value={selected.user.name} />
              {selected.user.phone && <Row label="Telefone" value={selected.user.phone} />}
              <Row label="Loja" value={selected.store.name} />
              {selected.payment && (
                <>
                  <Row label="Pagamento" value={PAYMENT_LABEL[selected.payment.method] ?? selected.payment.method} />
                  <Row label="Status pgto." value={selected.payment.status} />
                </>
              )}
              <div style={{ height: 1, background: BORDER }} />
              <Row label="Subtotal" value={fmtBRL(selected.subtotal)} />
              <Row label="Taxa de entrega" value={fmtBRL(selected.deliveryFee)} />
              {selected.discount > 0 && <Row label="Desconto" value={`-${fmtBRL(selected.discount)}`} />}
              <Row label="Total" value={fmtBRL(selected.total)} bold />
              {selected.delivery && (
                <>
                  <div style={{ height: 1, background: BORDER }} />
                  <Row label="Status entrega" value={selected.delivery.status} />
                  <Row label="Distância" value={`${selected.delivery.distanceKm.toFixed(1)} km`} />
                  <Row label="Taxa entregador" value={fmtBRL(selected.delivery.courierFee)} />
                  {selected.delivery.courier && <Row label="Entregador" value={selected.delivery.courier.user.name} />}
                </>
              )}
              {selected.notes && (
                <>
                  <div style={{ height: 1, background: BORDER }} />
                  <Row label="Observações" value={selected.notes} />
                </>
              )}
              <div style={{ height: 1, background: BORDER }} />
              <Row label="Criado em" value={fmtDate(selected.createdAt)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 13, color: MUTED, fontFamily: "'DM Sans', sans-serif" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: bold ? 800 : 600, fontFamily: "'DM Sans', sans-serif", textAlign: 'right' as const }}>{value}</span>
    </div>
  )
}
