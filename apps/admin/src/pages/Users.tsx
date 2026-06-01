import { useEffect, useState } from 'react'
import { api } from '../api'
import type { User } from '../types'
import { useToast } from '../context/ToastContext'

const O = '#FF6600'
const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const LIGHT = '#BBA898'
const BORDER = '#F0E8E0'
const SANS = "'DM Sans', sans-serif"
const MONO = "'JetBrains Mono', monospace"

const ROLE_CFG: Record<User['role'], { label: string; color: string; bg: string }> = {
  CONSUMER:    { label: 'Cliente',    color: '#1D4ED8', bg: '#DBEAFE' },
  STORE_OWNER: { label: 'Lojista',    color: '#6D28D9', bg: '#EDE9FE' },
  COURIER:     { label: 'Entregador', color: '#92400E', bg: '#FEF3C7' },
  ADMIN:       { label: 'Admin',      color: '#7F1D1D', bg: '#FEE2E2' },
}

function fmtDate(d: string) { return new Date(d).toLocaleDateString('pt-BR') }

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

export function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const { showToast } = useToast()

  useEffect(() => {
    api.users()
      .then(setUsers)
      .catch(() => showToast('Erro ao carregar usuários', 'error'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()),
  )

  const TH = { padding: '11px 16px', textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: LIGHT, letterSpacing: '0.07em', background: '#FDF8F3', whiteSpace: 'nowrap' as const, fontFamily: SANS }
  const TD = { padding: '13px 16px', verticalAlign: 'middle' as const }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' as const }}>
        <div>
          <h1 style={{ fontFamily: SANS, fontWeight: 800, fontSize: 24, color: TEXT, letterSpacing: '-0.02em', marginBottom: 4 }}>
            Usuários
          </h1>
          <p style={{ color: MUTED, fontSize: 13.5, fontFamily: SANS }}>
            {loading ? '...' : `${users.length.toLocaleString('pt-BR')} contas registradas`}
          </p>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 13px',
          background: '#fff',
          borderRadius: 9,
          border: `1.5px solid ${BORDER}`,
          transition: 'border-color 0.12s, box-shadow 0.12s',
          width: 260,
        }}
          onFocusCapture={e => {
            const el = e.currentTarget as HTMLElement
            el.style.borderColor = O
            el.style.boxShadow = `0 0 0 3px rgba(255,102,0,0.08)`
          }}
          onBlurCapture={e => {
            const el = e.currentTarget as HTMLElement
            el.style.borderColor = BORDER
            el.style.boxShadow = 'none'
          }}
        >
          <span style={{ color: LIGHT }}><SearchIcon /></span>
          <input
            type="text"
            placeholder="Buscar por nome ou email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 13,
              fontFamily: SANS,
              color: TEXT,
              width: '100%',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: LIGHT, fontSize: 14, lineHeight: 1, padding: 0 }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' as const, minWidth: 580 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              {['Usuário', 'E-mail', 'Telefone', 'Tipo', 'Status', 'Cadastro'].map((c, i) => (
                <th key={i} style={TH}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: '48px', textAlign: 'center' as const, color: LIGHT, fontSize: 13.5, fontFamily: SANS }}>Carregando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '48px', textAlign: 'center' as const, color: LIGHT, fontSize: 13.5, fontFamily: SANS }}>
                {search ? `Nenhum resultado para "${search}"` : 'Nenhum usuário encontrado'}
              </td></tr>
            ) : filtered.map((u, idx) => {
              const rc = ROLE_CFG[u.role] ?? { label: u.role, color: MUTED, bg: '#F0E8E0' }
              const hue = u.name.charCodeAt(0) * 12 % 360
              return (
                <tr
                  key={u.id}
                  style={{ borderBottom: idx < filtered.length - 1 ? `1px solid ${BORDER}` : 'none', transition: 'background 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#FDF8F3' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <td style={TD}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: 9,
                        background: `hsl(${hue}, 55%, 92%)`,
                        color: `hsl(${hue}, 55%, 35%)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700, flexShrink: 0, fontFamily: SANS,
                      }}>
                        {u.name[0].toUpperCase()}
                      </div>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: TEXT, fontFamily: SANS }}>{u.name}</span>
                    </div>
                  </td>
                  <td style={{ ...TD, fontSize: 13, color: MUTED, fontFamily: SANS }}>{u.email}</td>
                  <td style={{ ...TD, fontSize: 12.5, color: LIGHT, fontFamily: MONO }}>{u.phone ?? '—'}</td>
                  <td style={TD}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '3px 8px 3px 6px',
                      borderRadius: 6,
                      background: rc.bg,
                      color: rc.color,
                      fontSize: 11.5, fontWeight: 600, fontFamily: SANS, letterSpacing: '0.01em',
                    }}>
                      <span style={{ width: 5.5, height: 5.5, borderRadius: '50%', background: rc.color, flexShrink: 0 }} />
                      {rc.label}
                    </span>
                  </td>
                  <td style={TD}>
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: u.isActive ? '#DCFCE7' : '#FEE2E2',
                      color: u.isActive ? '#15803D' : '#B91C1C',
                      fontSize: 11.5, fontWeight: 600, fontFamily: SANS,
                    }}>
                      {u.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={{ ...TD, fontSize: 12, color: LIGHT, fontFamily: SANS }}>{fmtDate(u.createdAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {!loading && filtered.length > 0 && (
          <div style={{
            padding: '10px 16px',
            borderTop: `1px solid ${BORDER}`,
            fontSize: 12,
            color: LIGHT,
            fontFamily: SANS,
          }}>
            {search ? `${filtered.length} de ${users.length} usuários` : `${filtered.length} usuários`}
          </div>
        )}
      </div>
    </div>
  )
}
