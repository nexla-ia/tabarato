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

  // Confirmação com resumo antes de aprovar/rejeitar — evita clique acidental
  // numa ação que já impacta o lojista na hora.
  const [confirmTarget, setConfirmTarget] = useState<{ store: Store; status: 'APPROVED' | 'REJECTED' } | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    api.stores(filter === 'ALL' ? undefined : filter)
      .then(data => { if (active) setStores(data) })
      .catch(() => showToast('Erro ao carregar lojas', 'error'))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filter, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  const closeConfirm = () => { if (!confirming) setConfirmTarget(null) }

  const runAction = async () => {
    if (!confirmTarget) return
    const { store, status } = confirmTarget
    setConfirming(true)
    try {
      await api.updateStoreStatus(store.id, status)
      showToast(status === 'APPROVED' ? 'Loja aprovada!' : 'Loja rejeitada.', status === 'APPROVED' ? 'success' : 'error')
      setRefresh(r => r + 1)
      setConfirmTarget(null)
    } catch (err: unknown) {
      showToast((err as Error).message || 'Erro', 'error')
    } finally {
      setConfirming(false)
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
                <td style={{ ...TD, whiteSpace: 'nowrap' as const }}>
                  <div style={{ fontSize: 12.5, color: MUTED, fontFamily: MONO }}>{fmtCNPJ(s.cnpj)}</div>
                  {s.documentUrl ? (
                    <a
                      href={s.documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 11.5, color: O, fontWeight: 700, fontFamily: SANS, textDecoration: 'none' }}
                    >
                      📄 Ver documento
                    </a>
                  ) : (
                    <span style={{ fontSize: 11, color: LIGHT, fontFamily: SANS }}>sem documento</span>
                  )}
                </td>
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
                        onClick={() => setConfirmTarget({ store: s, status: 'APPROVED' })}
                        style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#DCFCE7', color: '#15803D', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SANS, transition: 'opacity 0.1s' }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                      >
                        ✓ Aprovar
                      </button>
                    )}
                    {s.status !== 'REJECTED' && (
                      <button
                        onClick={() => setConfirmTarget({ store: s, status: 'REJECTED' })}
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

      {/* Modal de confirmação — resumo antes de aprovar/rejeitar */}
      {confirmTarget && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeConfirm() }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(26,10,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, backdropFilter: 'blur(4px)', padding: 24,
          }}
        >
          <div style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440,
            boxShadow: '0 32px 80px rgba(26,10,0,0.3)', border: `1px solid ${BORDER}`,
            overflow: 'hidden',
          }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12 }}>
              {confirmTarget.store.logoUrl ? (
                <img src={confirmTarget.store.logoUrl} alt={confirmTarget.store.name} style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'cover', border: `1px solid ${BORDER}`, flexShrink: 0 }} />
              ) : (
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#FFF3EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>🏪</div>
              )}
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: TEXT, fontFamily: SANS }}>{confirmTarget.store.name}</div>
                <div style={{ fontSize: 11.5, color: LIGHT, fontFamily: SANS }}>{confirmTarget.store.user.email}</div>
              </div>
            </div>

            <div style={{ padding: '18px 22px' }}>
              <div style={{
                display: 'inline-block', padding: '3px 10px', borderRadius: 6, marginBottom: 14,
                background: confirmTarget.status === 'APPROVED' ? '#DCFCE7' : '#FEE2E2',
                color: confirmTarget.status === 'APPROVED' ? '#15803D' : '#B91C1C',
                fontSize: 11.5, fontWeight: 800, fontFamily: SANS, letterSpacing: '0.03em',
              }}>
                {confirmTarget.status === 'APPROVED' ? 'APROVAR LOJA' : 'REJEITAR LOJA'}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 16 }}>
                {[
                  ['CNPJ', fmtCNPJ(confirmTarget.store.cnpj)],
                  ['Endereço', confirmTarget.store.address || '—'],
                  ['Telefone', confirmTarget.store.phone || '—'],
                  ['Categorias', confirmTarget.store.categories.length ? confirmTarget.store.categories.map(c => c.name).join(', ') : '—'],
                  ['Documento', confirmTarget.store.documentUrl ? '📄 enviado' : 'não enviado'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5, fontFamily: SANS }}>
                    <span style={{ color: LIGHT, fontWeight: 700, flexShrink: 0 }}>{k}</span>
                    <span style={{ color: TEXT, textAlign: 'right' as const }}>{v}</span>
                  </div>
                ))}
              </div>

              <div style={{
                padding: '11px 13px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.5, fontFamily: SANS,
                background: confirmTarget.status === 'APPROVED' ? '#ECFDF5' : '#FFFBEB',
                color: confirmTarget.status === 'APPROVED' ? '#047857' : '#92620A',
                border: `1px solid ${confirmTarget.status === 'APPROVED' ? '#A7F3D0' : '#FDE68A'}`,
              }}>
                {confirmTarget.status === 'APPROVED'
                  ? 'A loja vai aparecer no marketplace pros clientes e já pode começar a receber pedidos.'
                  : 'A loja não vai aparecer no marketplace. O lojista vai ver o cadastro como rejeitado no painel dele.'}
              </div>
            </div>

            <div style={{ padding: '14px 22px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 10 }}>
              <button
                onClick={closeConfirm}
                disabled={confirming}
                style={{ flex: 1, padding: 11, borderRadius: 10, border: `1px solid ${BORDER}`, background: '#fff', color: MUTED, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: SANS }}
              >
                Cancelar
              </button>
              <button
                onClick={runAction}
                disabled={confirming}
                style={{
                  flex: 1, padding: 11, borderRadius: 10, border: 'none',
                  background: confirmTarget.status === 'APPROVED' ? '#15803D' : '#B91C1C',
                  color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
                  opacity: confirming ? 0.7 : 1,
                }}
              >
                {confirming ? 'Confirmando...' : confirmTarget.status === 'APPROVED' ? 'Confirmar aprovação' : 'Confirmar rejeição'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
