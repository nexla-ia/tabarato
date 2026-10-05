import { useCallback, useEffect, useState } from 'react'
import { api, type AdminWithdrawal } from '../api'
import { useToast } from '../context/ToastContext'

const O = '#FF6600'
const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const BORDER = '#F0E8E0'
const CARD = '#FFFFFF'
const SANS = "'DM Sans', sans-serif"

type Filtro = 'TODOS' | 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'

const STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  PENDING: { label: 'Não enviado', fg: '#B45309', bg: '#FEF3C7' },
  PROCESSING: { label: 'Processando', fg: '#1D4ED8', bg: '#DBEAFE' },
  DONE: { label: 'Concluído', fg: '#15803D', bg: '#DCFCE7' },
  FAILED: { label: 'Falhou', fg: '#B91C1C', bg: '#FEE2E2' },
}

const money = (v: number | string) => `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}`
const minsAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 60000)

function quando(iso: string) {
  const m = minsAgo(iso)
  if (m < 60) return `há ${m} min`
  if (m < 1440) return `há ${Math.floor(m / 60)}h`
  return new Date(iso).toLocaleDateString('pt-BR')
}

export function Saques() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<AdminWithdrawal[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('TODOS')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setLoadError(false)
    try {
      setRows(await api.withdrawals(filtro === 'TODOS' ? undefined : filtro))
    } catch {
      setLoadError(true)
      if (!silent) showToast('Erro ao carregar saques', 'error')
    } finally {
      setLoading(false)
    }
  }, [filtro, showToast])

  useEffect(() => { load() }, [load])

  // Saque parado = dinheiro já debitado da carteira que não chegou no destino.
  const travados = rows.filter(
    (r) => (r.status === 'PROCESSING' && minsAgo(r.createdAt) > 30) || r.status === 'PENDING',
  )

  return (
    <div style={{ fontFamily: SANS, maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: TEXT, margin: 0 }}>Saques</h1>
        <button
          onClick={() => load()}
          style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '7px 14px', fontSize: 13, fontWeight: 700, color: MUTED, cursor: 'pointer', fontFamily: SANS }}
        >
          Atualizar
        </button>
      </div>
      <p style={{ fontSize: 13.5, color: MUTED, marginTop: 0, marginBottom: 18 }}>
        Repasses de lojas e entregadores via PIX. O envio é automático — esta tela existe para enxergar o que travou.
      </p>

      {travados.length > 0 && (
        <div style={{
          background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12,
          padding: '12px 16px', marginBottom: 18, fontSize: 13.5, color: '#92400E', fontWeight: 600, lineHeight: 1.5,
        }}>
          {travados.length} saque(s) parado(s) — o valor já saiu da carteira mas não foi confirmado.
          O sistema reconsulta o Asaas sozinho a cada 5 min; se persistir, confira o painel do Asaas.
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {(['TODOS', 'PENDING', 'PROCESSING', 'DONE', 'FAILED'] as Filtro[]).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            style={{
              padding: '8px 15px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
              border: `1.5px solid ${filtro === f ? O : BORDER}`,
              background: filtro === f ? '#FFF0E6' : CARD,
              color: filtro === f ? O : MUTED,
            }}
          >
            {f === 'TODOS' ? 'Todos' : STATUS[f].label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: MUTED, fontSize: 14, padding: 40, textAlign: 'center' }}>Carregando…</div>
      ) : loadError ? (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 14, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#B91C1C', marginBottom: 12 }}>
            Não foi possível carregar os saques
          </div>
          <button
            onClick={() => load()}
            style={{ background: '#B91C1C', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 20px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: SANS }}
          >
            Tentar novamente
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 14, padding: 40, textAlign: 'center' }}>Nenhum saque neste filtro.</div>
      ) : (
        rows.map((r) => {
          const st = STATUS[r.status] ?? { label: r.status, fg: MUTED, bg: '#F3F4F6' }
          return (
            <div
              key={r.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
                padding: '12px 14px', marginBottom: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: TEXT }}>
                  {r.ownerName ?? 'Sem nome'}{' '}
                  <span style={{ color: MUTED, fontWeight: 500, fontSize: 12.5 }}>
                    · {r.ownerType === 'STORE' ? 'Loja' : 'Entregador'}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3, wordBreak: 'break-all' }}>
                  {quando(r.createdAt)} · chave {r.pixKeyType ?? '—'}: {r.pixKey}
                </div>
                {r.failReason && (
                  <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 3 }}>Motivo: {r.failReason}</div>
                )}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>
                {money(r.amount)}
              </div>
              <span
                style={{
                  background: st.bg, color: st.fg, borderRadius: 20,
                  padding: '5px 12px', fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}
              >
                {st.label}
              </span>
            </div>
          )
        })
      )}
    </div>
  )
}
