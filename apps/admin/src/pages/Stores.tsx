import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Store } from '../types'
import { useToast } from '../context/ToastContext'
import { StatusBadge } from '../components/StatusBadge'

type StatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'

const O = '#FF6600'
const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const LIGHT = '#BBA898'
const BORDER = '#F0E8E0'
const SANS = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL',       label: 'Todas'      },
  { key: 'PENDING',   label: 'Pendentes'  },
  { key: 'APPROVED',  label: 'Aprovadas'  },
  { key: 'REJECTED',  label: 'Rejeitadas' },
  { key: 'SUSPENDED', label: 'Suspensas'  },
]

function fmtCNPJ(v: string) { return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('pt-BR') }

export function Stores() {
  const [stores, setStores] = useState<Store[]>([])
  const [filter, setFilter] = useState<StatusFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const { showToast } = useToast()

  useEffect(() => {
    let active = true
    setLoading(true)
    api.stores(filter === 'ALL' ? undefined : filter)
      .then(data => { if (active) setStores(data) })
      .catch(() => showToast('Erro ao carregar lojas', 'error'))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filter, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await api.updateStoreStatus(id, status)
      showToast(status === 'APPROVED' ? 'Loja aprovada!' : 'Loja rejeitada.', status === 'APPROVED' ? 'success' : 'error')
      setRefresh(r => r + 1)
    } catch (err: unknown) {
      showToast((err as Error).message || 'Erro', 'error')
    }
  }

  const TH = { padding: '11px 16px', textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: LIGHT, letterSpacing: '0.07em', background: '#FDF8F3', whiteSpace: 'nowrap' as const, fontFamily: SANS }
  const TD = { padding: '13px 16px', verticalAlign: 'middle' as const }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: SANS, fontWeight: 800, fontSize: 24, color: TEXT, letterSpacing: '-0.02em', marginBottom: 4 }}>
          Lojas
        </h1>
        <p style={{ color: MUTED, fontSize: 13.5, fontFamily: SANS }}>Gerencie e aprove cadastros de lojas</p>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' as const }}>
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '5px 14px',
              borderRadius: 7,
              border: `1.5px solid ${filter === key ? O : BORDER}`,
              background: filter === key ? O : '#fff',
              color: filter === key ? '#fff' : MUTED,
              fontSize: 12.5,
              fontWeight: filter === key ? 700 : 500,
              cursor: 'pointer',
              fontFamily: SANS,
              transition: 'all 0.12s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' as const, minWidth: 700 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              {['Loja', 'CNPJ', 'Endereço', 'Categorias', 'Status', 'Cadastro', 'Ações'].map((c, i) => (
                <th key={i} style={TH}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center' as const, color: LIGHT, fontSize: 13.5, fontFamily: SANS }}>Carregando...</td></tr>
            ) : stores.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center' as const, color: LIGHT, fontSize: 13.5, fontFamily: SANS }}>Nenhuma loja encontrada</td></tr>
            ) : stores.map((s, idx) => (
              <tr
                key={s.id}
                style={{ borderBottom: idx < stores.length - 1 ? `1px solid ${BORDER}` : 'none', transition: 'background 0.1s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#FDF8F3' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <td style={TD}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {s.logoUrl ? (
                      <img src={s.logoUrl} alt={s.name} style={{ width: 34, height: 34, borderRadius: 9, objectFit: 'cover', border: `1px solid ${BORDER}`, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: '#FFF3EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🏪</div>
                    )}
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT, fontFamily: SANS }}>{s.name}</div>
                      <div style={{ fontSize: 11.5, color: LIGHT, fontFamily: SANS }}>{s.user.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ ...TD, fontSize: 12.5, color: MUTED, fontFamily: MONO, whiteSpace: 'nowrap' as const }}>{fmtCNPJ(s.cnpj)}</td>
                <td style={{ ...TD, fontSize: 12, color: MUTED, fontFamily: SANS, maxWidth: 160 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{s.address}</div>
                </td>
                <td style={TD}>
                  <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
                    {s.categories.slice(0, 2).map(c => (
                      <span key={c.name} style={{ padding: '2px 7px', borderRadius: 5, background: '#FFF3EB', color: MUTED, fontSize: 11, fontWeight: 500, fontFamily: SANS, whiteSpace: 'nowrap' as const }}>
                        {c.name}
                      </span>
                    ))}
                    {s.categories.length > 2 && <span style={{ fontSize: 11, color: LIGHT, fontFamily: SANS }}>+{s.categories.length - 2}</span>}
                    {s.categories.length === 0 && <span style={{ color: LIGHT, fontSize: 12 }}>—</span>}
                  </div>
                </td>
                <td style={TD}><StatusBadge status={s.status} /></td>
                <td style={{ ...TD, fontSize: 12, color: LIGHT, fontFamily: SANS, whiteSpace: 'nowrap' as const }}>{fmtDate(s.createdAt)}</td>
                <td style={TD}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {s.status !== 'APPROVED' && (
                      <button
                        onClick={() => handleAction(s.id, 'APPROVED')}
                        style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#DCFCE7', color: '#15803D', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SANS, transition: 'opacity 0.1s' }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                      >
                        ✓ Aprovar
                      </button>
                    )}
                    {s.status !== 'REJECTED' && (
                      <button
                        onClick={() => handleAction(s.id, 'REJECTED')}
                        style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#FEE2E2', color: '#B91C1C', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SANS, transition: 'opacity 0.1s' }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                      >
                        ✕ Rejeitar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
