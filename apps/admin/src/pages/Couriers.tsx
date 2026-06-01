import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Courier } from '../types'
import { useToast } from '../context/ToastContext'
import { StatusBadge } from '../components/StatusBadge'

type StatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
type DocTab = 'cnh' | 'identity' | 'vehicle'
type DocStatus = 'APPROVED' | 'REJECTED' | null

const O = '#FF6600'
const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const LIGHT = '#BBA898'
const BORDER = '#F0E8E0'
const SANS = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL',       label: 'Todos'      },
  { key: 'PENDING',   label: 'Pendentes'  },
  { key: 'APPROVED',  label: 'Aprovados'  },
  { key: 'REJECTED',  label: 'Rejeitados' },
  { key: 'SUSPENDED', label: 'Suspensos'  },
]

const DOC_KEYS: { key: DocTab; label: string; statusField: 'cnhStatus' | 'identityStatus' | 'vehicleDocStatus'; urlField: 'cnhPhotoUrl' | 'identityPhotoUrl' | 'vehicleDocPhotoUrl' }[] = [
  { key: 'cnh',      label: 'CNH',          statusField: 'cnhStatus',        urlField: 'cnhPhotoUrl'        },
  { key: 'identity', label: 'Identidade',   statusField: 'identityStatus',   urlField: 'identityPhotoUrl'   },
  { key: 'vehicle',  label: 'Doc. Veículo', statusField: 'vehicleDocStatus', urlField: 'vehicleDocPhotoUrl' },
]

function fmtCPF(v: string) { return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('pt-BR') }

function DocStatusDot({ status }: { status: DocStatus }) {
  const color = status === 'APPROVED' ? '#16A34A' : status === 'REJECTED' ? '#DC2626' : '#D1C4B8'
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
}

function DocViewer({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
        height: 220, border: `2px dashed ${BORDER}`, borderRadius: 10,
        color: LIGHT, fontSize: 13.5, gap: 10, fontFamily: SANS,
      }}>
        <span style={{ fontSize: 30, opacity: 0.35 }}>📄</span>
        Documento não enviado
      </div>
    )
  }
  const isPdf = /\.pdf($|\?)/i.test(url) || url.includes('application/pdf')
  if (isPdf) return <iframe src={url} title="PDF" style={{ width: '100%', height: 320, border: 'none', borderRadius: 10 }} />
  return (
    <img src={url} alt="Documento" style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 10, background: '#FDF8F3' }} />
  )
}

function Avatar({ name }: { name: string }) {
  const hue = name.charCodeAt(0) * 12 % 360
  return (
    <div style={{
      width: 34, height: 34, borderRadius: 9,
      background: `hsl(${hue}, 55%, 92%)`, color: `hsl(${hue}, 55%, 35%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700, flexShrink: 0, fontFamily: SANS,
    }}>
      {name[0].toUpperCase()}
    </div>
  )
}

export function Couriers() {
  const [couriers, setCouriers] = useState<Courier[]>([])
  const [filter, setFilter] = useState<StatusFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [selected, setSelected] = useState<Courier | null>(null)
  const [docTab, setDocTab] = useState<DocTab>('cnh')
  const [actioning, setActioning] = useState<string | null>(null) // 'approve' | 'reject' | 'doc-cnh-APPROVED' etc.
  const { showToast } = useToast()

  useEffect(() => {
    let active = true
    setLoading(true)
    api.couriers(filter === 'ALL' ? undefined : filter)
      .then(data => { if (active) setCouriers(data) })
      .catch(() => showToast('Erro ao carregar entregadores', 'error'))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filter, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleOverallAction = async (status: 'APPROVED' | 'REJECTED') => {
    if (!selected) return
    setActioning(status)
    try {
      const updated = await api.updateCourierStatus(selected.id, status)
      showToast(status === 'APPROVED' ? 'Entregador aprovado!' : 'Entregador rejeitado.', status === 'APPROVED' ? 'success' : 'error')
      setSelected(updated)
      setRefresh(r => r + 1)
    } catch (err: unknown) {
      showToast((err as Error).message || 'Erro', 'error')
    } finally {
      setActioning(null)
    }
  }

  const handleDocAction = async (doc: DocTab, status: 'APPROVED' | 'REJECTED') => {
    if (!selected) return
    const key = `doc-${doc}-${status}`
    setActioning(key)
    try {
      const updated = await api.updateCourierDocStatus(selected.id, doc, status)
      setSelected(updated)
      // Update in list too
      setCouriers(cs => cs.map(c => c.id === updated.id ? updated : c))
      const docLabel = DOC_KEYS.find(d => d.key === doc)?.label ?? doc
      showToast(
        status === 'APPROVED' ? `${docLabel} aprovada!` : `${docLabel} rejeitada.`,
        status === 'APPROVED' ? 'success' : 'error',
      )
    } catch (err: unknown) {
      showToast((err as Error).message || 'Erro', 'error')
    } finally {
      setActioning(null)
    }
  }

  const openModal = (c: Courier) => { setSelected(c); setDocTab('cnh'); setActioning(null) }
  const closeModal = () => { setSelected(null); setActioning(null) }

  const TH = { padding: '11px 16px', textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: LIGHT, letterSpacing: '0.07em', background: '#FDF8F3', whiteSpace: 'nowrap' as const, fontFamily: SANS }
  const TD = { padding: '13px 16px', verticalAlign: 'middle' as const }

  const currentDoc = selected ? DOC_KEYS.find(d => d.key === docTab)! : null
  const currentDocStatus: DocStatus = selected && currentDoc ? (selected[currentDoc.statusField] as DocStatus) : null
  const currentDocUrl = selected && currentDoc ? selected[currentDoc.urlField] : null

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: SANS, fontWeight: 800, fontSize: 24, color: TEXT, letterSpacing: '-0.02em', marginBottom: 4 }}>
          Entregadores
        </h1>
        <p style={{ color: MUTED, fontSize: 13.5, fontFamily: SANS }}>Revise e aprove os cadastros de entregadores</p>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' as const }}>
        {FILTERS.map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)} style={{
            padding: '5px 14px', borderRadius: 7,
            border: `1.5px solid ${filter === key ? O : BORDER}`,
            background: filter === key ? O : '#fff',
            color: filter === key ? '#fff' : MUTED,
            fontSize: 12.5, fontWeight: filter === key ? 700 : 500,
            cursor: 'pointer', fontFamily: SANS, transition: 'all 0.12s',
          }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' as const, minWidth: 680 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              {['Entregador', 'CPF', 'CNH', 'Placa', 'Status', 'Cadastro', ''].map((c, i) => (
                <th key={i} style={TH}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center' as const, color: LIGHT, fontSize: 13.5, fontFamily: SANS }}>Carregando...</td></tr>
            ) : couriers.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center' as const, color: LIGHT, fontSize: 13.5, fontFamily: SANS }}>Nenhum entregador encontrado</td></tr>
            ) : couriers.map((c, idx) => (
              <tr key={c.id}
                style={{ borderBottom: idx < couriers.length - 1 ? `1px solid ${BORDER}` : 'none', transition: 'background 0.1s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#FDF8F3' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <td style={TD}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={c.user.name} />
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT, fontFamily: SANS }}>{c.user.name}</div>
                      <div style={{ fontSize: 11.5, color: LIGHT, fontFamily: SANS }}>{c.user.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ ...TD, fontSize: 12.5, color: MUTED, fontFamily: MONO }}>{fmtCPF(c.cpf)}</td>
                <td style={{ ...TD, fontSize: 12.5, color: MUTED, fontFamily: MONO }}>{c.cnh}</td>
                <td style={{ ...TD, fontSize: 12.5, color: MUTED, fontFamily: MONO }}>{c.vehiclePlate.toUpperCase()}</td>
                <td style={TD}><StatusBadge status={c.status} /></td>
                <td style={{ ...TD, fontSize: 12, color: LIGHT, fontFamily: SANS, whiteSpace: 'nowrap' as const }}>{fmtDate(c.createdAt)}</td>
                <td style={TD}>
                  <button
                    onClick={() => openModal(c)}
                    style={{
                      padding: '5px 13px', borderRadius: 7, border: `1.5px solid ${BORDER}`,
                      background: 'transparent', color: MUTED, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', fontFamily: SANS, transition: 'all 0.1s', whiteSpace: 'nowrap' as const,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = O; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = O }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = MUTED; e.currentTarget.style.borderColor = BORDER }}
                  >
                    Ver docs
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {selected && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeModal() }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(26,10,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, backdropFilter: 'blur(4px)', padding: 24,
          }}
        >
          <div style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 700,
            maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' as const,
            boxShadow: '0 32px 80px rgba(26,10,0,0.3)', animation: 'scaleIn 0.16s ease',
            border: `1px solid ${BORDER}`,
          }}>

            {/* Header */}
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar name={selected.user.name} />
                <div>
                  <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, color: TEXT }}>{selected.user.name}</div>
                  <div style={{ fontSize: 12, color: LIGHT, fontFamily: SANS, marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {selected.user.email}
                    <StatusBadge status={selected.status} inline />
                  </div>
                </div>
              </div>
              <button
                onClick={closeModal}
                style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${BORDER}`, background: '#FDF8F3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 16, flexShrink: 0 }}
                onMouseEnter={e => { e.currentTarget.style.background = BORDER }}
                onMouseLeave={e => { e.currentTarget.style.background = '#FDF8F3' }}
              >×</button>
            </div>

            {/* Info strip */}
            <div style={{ padding: '10px 22px', background: '#FDF8F3', borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 28 }}>
              {[['CPF', fmtCPF(selected.cpf)], ['CNH', selected.cnh], ['Placa', selected.vehiclePlate.toUpperCase()], ['Veículo', selected.vehicleType]].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: LIGHT, letterSpacing: '0.08em', fontFamily: SANS }}>{k}</div>
                  <div style={{ fontSize: 13, color: TEXT, fontFamily: MONO, marginTop: 1 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Doc tabs */}
            <div style={{ display: 'flex', padding: '0 22px', borderBottom: `1px solid ${BORDER}`, background: '#fff' }}>
              {DOC_KEYS.map(({ key, label, statusField }) => {
                const s = selected[statusField] as DocStatus
                return (
                  <button key={key} onClick={() => setDocTab(key)} style={{
                    padding: '11px 16px', border: 'none',
                    borderBottom: `2px solid ${docTab === key ? O : 'transparent'}`,
                    background: 'transparent', color: docTab === key ? O : MUTED,
                    fontSize: 13, fontWeight: docTab === key ? 700 : 500,
                    cursor: 'pointer', fontFamily: SANS, transition: 'all 0.12s',
                    display: 'flex', alignItems: 'center', gap: 7, marginBottom: -1,
                  }}>
                    <DocStatusDot status={s} />
                    {label}
                    {s === 'APPROVED' && <span style={{ fontSize: 10, color: '#16A34A', fontWeight: 700 }}>✓</span>}
                    {s === 'REJECTED' && <span style={{ fontSize: 10, color: '#DC2626', fontWeight: 700 }}>✕</span>}
                  </button>
                )
              })}
            </div>

            {/* Doc content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 22px 16px', background: '#FDF8F3' }}>
              <DocViewer url={currentDocUrl ?? null} />

              {/* Per-document action buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                {currentDocStatus !== 'APPROVED' && (
                  <button
                    disabled={actioning !== null}
                    onClick={() => handleDocAction(docTab, 'APPROVED')}
                    style={{
                      padding: '7px 16px', borderRadius: 8, border: 'none',
                      background: currentDocStatus === null ? '#DCFCE7' : '#16A34A',
                      color: currentDocStatus === null ? '#15803D' : '#fff',
                      fontSize: 12.5, fontWeight: 700, cursor: actioning ? 'not-allowed' : 'pointer',
                      fontFamily: SANS, transition: 'all 0.12s', opacity: actioning ? 0.6 : 1,
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}
                  >
                    {actioning === `doc-${docTab}-APPROVED` ? 'Salvando...' : `✓ Aprovar ${DOC_KEYS.find(d => d.key === docTab)?.label}`}
                  </button>
                )}
                {currentDocStatus === 'APPROVED' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: '#DCFCE7', color: '#15803D', fontSize: 12.5, fontWeight: 700, fontFamily: SANS }}>
                    ✓ Aprovado
                  </div>
                )}
                {currentDocStatus !== 'REJECTED' && (
                  <button
                    disabled={actioning !== null}
                    onClick={() => handleDocAction(docTab, 'REJECTED')}
                    style={{
                      padding: '7px 16px', borderRadius: 8, border: 'none',
                      background: '#FEE2E2', color: '#B91C1C',
                      fontSize: 12.5, fontWeight: 700, cursor: actioning ? 'not-allowed' : 'pointer',
                      fontFamily: SANS, transition: 'all 0.12s', opacity: actioning ? 0.6 : 1,
                    }}
                  >
                    {actioning === `doc-${docTab}-REJECTED` ? 'Salvando...' : `✕ Rejeitar ${DOC_KEYS.find(d => d.key === docTab)?.label}`}
                  </button>
                )}
                {currentDocStatus === 'REJECTED' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: '#FEE2E2', color: '#B91C1C', fontSize: 12.5, fontWeight: 700, fontFamily: SANS }}>
                    ✕ Rejeitado
                  </div>
                )}
              </div>
            </div>

            {/* Overall action footer */}
            <div style={{ padding: '12px 22px', borderTop: `1px solid ${BORDER}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 11.5, color: LIGHT, fontFamily: SANS }}>
                {DOC_KEYS.map(d => ({
                  label: d.label,
                  status: selected[d.statusField] as DocStatus,
                })).map(({ label, status }) => (
                  <span key={label} style={{ marginRight: 12 }}>
                    <DocStatusDot status={status} />
                    {' '}<span style={{ color: MUTED }}>{label}</span>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {selected.status !== 'APPROVED' && (
                  <button
                    disabled={actioning !== null}
                    onClick={() => handleOverallAction('APPROVED')}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: actioning === 'APPROVED' ? '#16A34A' : '#DCFCE7',
                      color: actioning === 'APPROVED' ? '#fff' : '#15803D',
                      fontSize: 12.5, fontWeight: 700, cursor: actioning ? 'not-allowed' : 'pointer',
                      fontFamily: SANS, opacity: actioning ? 0.6 : 1,
                    }}
                  >
                    {actioning === 'APPROVED' ? 'Aprovando...' : 'Aprovar entregador'}
                  </button>
                )}
                {selected.status !== 'REJECTED' && (
                  <button
                    disabled={actioning !== null}
                    onClick={() => handleOverallAction('REJECTED')}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: actioning === 'REJECTED' ? '#DC2626' : '#FEE2E2',
                      color: actioning === 'REJECTED' ? '#fff' : '#B91C1C',
                      fontSize: 12.5, fontWeight: 700, cursor: actioning ? 'not-allowed' : 'pointer',
                      fontFamily: SANS, opacity: actioning ? 0.6 : 1,
                    }}
                  >
                    {actioning === 'REJECTED' ? 'Rejeitando...' : 'Rejeitar entregador'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
