import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type AdminProduct, type WhiteBgSummary } from '../api'
import { useToast } from '../context/ToastContext'

const O = '#FF6600'
const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const BORDER = '#F0E8E0'
const CARD = '#FFFFFF'
const RED = '#DC2626'
const GREEN = '#16A34A'
const SANS = "'DM Sans', sans-serif"

type Filter = 'all' | 'blocked'

function fmtBRL(v: number | string | null) {
  if (v == null) return '—'
  return `R$ ${Number(v).toFixed(2).replace('.', ',')}`
}

/**
 * Fundo branco: o servidor trata toda foto de produto sozinho (não é opção de
 * ninguém). Este quadro só mostra o andamento — atualiza enquanto há fila.
 */
function FundoBrancoStatus() {
  const [resumo, setResumo] = useState<WhiteBgSummary | null>(null)
  const [erro, setErro] = useState(false)

  const carregar = useCallback(async () => {
    try { setResumo(await api.whiteBackgroundSummary()); setErro(false) } catch { setErro(true) }
  }, [])
  useEffect(() => { carregar() }, [carregar])
  // Com fila andando, confere de novo a cada 10 s.
  useEffect(() => {
    if (!resumo || (!resumo.rodando && resumo.fotos === 0)) return
    const t = setInterval(carregar, 10_000)
    return () => clearInterval(t)
  }, [resumo, carregar])

  if (erro || !resumo) return null

  const [cor, texto] = !resumo.ativo
    ? ['#B45309', 'Desligado: falta a BRIA_API_TOKEN nas variáveis da API no Railway.']
    : resumo.fotos > 0
      ? [MUTED, `Processando sozinho: faltam ${resumo.fotos} foto${resumo.fotos === 1 ? '' : 's'} em ${resumo.produtos} produto${resumo.produtos === 1 ? '' : 's'}.`]
      : [GREEN, 'Todas as fotos de produto estão com fundo branco.']

  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14,
      padding: '12px 16px', marginBottom: 18, display: 'flex', gap: 12, alignItems: 'center',
    }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: '#FFF0E6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>✨</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 13.5, color: TEXT }}>Fundo branco automático</div>
        <div style={{ fontSize: 12.5, color: cor, marginTop: 2, fontWeight: 600 }}>
          {texto}
          {resumo.falharam > 0 && (
            <span style={{ color: RED }}> {resumo.falharam} foto{resumo.falharam === 1 ? '' : 's'} não deu para tratar (tenta de novo quando a API reiniciar).</span>
          )}
        </div>
      </div>
    </div>
  )
}

export function Produtos() {
  const { showToast } = useToast()
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [blockTarget, setBlockTarget] = useState<AdminProduct | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const firstLoad = useRef(true)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      setProducts(await api.products(search.trim() || undefined, filter === 'blocked' ? 'true' : undefined))
    } catch {
      showToast('Erro ao carregar produtos', 'error')
    } finally {
      setLoading(false)
    }
  }, [search, filter, showToast])

  // Recarrega ao trocar filtro/busca (debounce leve na busca).
  useEffect(() => {
    if (firstLoad.current) { firstLoad.current = false; load(); return }
    const t = setTimeout(() => load(true), 350)
    return () => clearTimeout(t)
  }, [load])

  async function doBlock() {
    if (!blockTarget) return
    setBusy(blockTarget.id)
    try {
      await api.setProductBlock(blockTarget.id, true, reason.trim() || undefined)
      showToast('Produto bloqueado. Não aparece mais para o cliente.', 'success')
      setBlockTarget(null); setReason('')
      load(true)
    } catch (err) {
      showToast((err as Error).message || 'Erro ao bloquear', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function unblock(p: AdminProduct) {
    if (!window.confirm(`Desbloquear "${p.name}"? Ele volta a aparecer para os clientes.`)) return
    setBusy(p.id)
    try {
      await api.setProductBlock(p.id, false)
      showToast('Produto desbloqueado.', 'success')
      load(true)
    } catch (err) {
      showToast((err as Error).message || 'Erro ao desbloquear', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ fontFamily: SANS, maxWidth: 1000 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: TEXT, margin: '0 0 4px' }}>Produtos</h1>
      <p style={{ fontSize: 13.5, color: MUTED, marginTop: 0, marginBottom: 18 }}>
        Moderação do catálogo. Bloqueie itens impróprios ou proibidos — eles somem do app e não podem ser pedidos.
      </p>

      <FundoBrancoStatus />

      {/* Busca + filtro */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar produto pelo nome…"
          style={{ flex: 1, minWidth: 220, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', fontSize: 14, color: TEXT, fontFamily: SANS }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {([['all', 'Todos'], ['blocked', 'Bloqueados']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              style={{
                padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
                border: `1.5px solid ${filter === k ? O : BORDER}`,
                background: filter === k ? '#FFF0E6' : CARD,
                color: filter === k ? O : MUTED,
              }}
            >{label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ color: MUTED, fontSize: 14, padding: 40, textAlign: 'center' }}>Carregando…</div>
      ) : products.length === 0 ? (
        <div style={{ color: MUTED, fontSize: 14, padding: 40, textAlign: 'center' }}>
          {filter === 'blocked' ? 'Nenhum produto bloqueado. 🎉' : 'Nenhum produto encontrado.'}
        </div>
      ) : (
        products.map((p) => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: CARD, border: `1px solid ${p.blockedByAdmin ? '#FECACA' : BORDER}`, borderRadius: 12,
            padding: 12, marginBottom: 8,
          }}>
            <div style={{ width: 48, height: 48, borderRadius: 10, background: '#F5EEE9', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {p.imageUrl
                ? <img src={p.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ color: '#C8B8B0', fontSize: 18 }}>🛒</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: TEXT, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {p.name}
                {p.blockedByAdmin && (
                  <span style={{ background: '#FEE2E2', color: RED, borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 800 }}>Bloqueado</span>
                )}
                {!p.isActive && !p.blockedByAdmin && (
                  <span style={{ background: '#F3F4F6', color: MUTED, borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>Inativo (loja)</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>
                {p.store?.name ?? 'Loja'} · {p.category?.name ?? 'Sem categoria'} · {fmtBRL(p.basePrice)}
              </div>
              {p.blockedByAdmin && p.blockReason && (
                <div style={{ fontSize: 12, color: RED, marginTop: 3 }}>Motivo: {p.blockReason}</div>
              )}
            </div>
            {p.blockedByAdmin ? (
              <button
                onClick={() => unblock(p)}
                disabled={busy === p.id}
                style={{ background: '#DCFCE7', color: GREEN, border: 'none', borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: SANS, flexShrink: 0, opacity: busy === p.id ? 0.6 : 1 }}
              >{busy === p.id ? '…' : 'Desbloquear'}</button>
            ) : (
              <button
                onClick={() => { setBlockTarget(p); setReason('') }}
                disabled={busy === p.id}
                style={{ background: '#FEE2E2', color: RED, border: 'none', borderRadius: 9, padding: '8px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: SANS, flexShrink: 0, opacity: busy === p.id ? 0.6 : 1 }}
              >Bloquear</button>
            )}
          </div>
        ))
      )}

      {/* Modal de bloqueio */}
      {blockTarget && (
        <div
          onClick={() => setBlockTarget(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: CARD, borderRadius: 16, padding: 22, width: 440, maxWidth: '100%' }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: TEXT, margin: '0 0 4px' }}>Bloquear produto</h2>
            <p style={{ fontSize: 13, color: MUTED, marginTop: 0, marginBottom: 14 }}>
              “{blockTarget.name}” ({blockTarget.store?.name ?? 'Loja'}) vai sumir do app e não poderá ser pedido.
            </p>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, display: 'block', marginBottom: 6 }}>Motivo (opcional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: item proibido, foto imprópria, preço abusivo…"
              rows={3}
              maxLength={200}
              style={{ width: '100%', border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, color: TEXT, fontFamily: SANS, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                onClick={() => setBlockTarget(null)}
                style={{ flex: 1, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, padding: 11, fontSize: 14, fontWeight: 700, color: MUTED, cursor: 'pointer', fontFamily: SANS }}
              >Cancelar</button>
              <button
                onClick={doBlock}
                disabled={busy !== null}
                style={{ flex: 1, background: RED, color: '#fff', border: 'none', borderRadius: 10, padding: 11, fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: SANS, opacity: busy !== null ? 0.6 : 1 }}
              >{busy !== null ? 'Bloqueando…' : 'Bloquear produto'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
