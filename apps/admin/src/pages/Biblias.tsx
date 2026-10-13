import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type AdminBibleRequest } from '../api'
import { useToast } from '../context/ToastContext'

const O = '#FF6600'
const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const BORDER = '#F0E8E0'
const CARD = '#FFFFFF'
const SANS = "'DM Sans', sans-serif"

type Filtro = 'TODOS' | 'PENDING' | 'SENT' | 'CANCELLED'

const STATUS: Record<string, { label: string; fg: string; bg: string }> = {
  PENDING: { label: 'A enviar', fg: '#B45309', bg: '#FEF3C7' },
  SENT: { label: 'Enviada', fg: '#15803D', bg: '#DCFCE7' },
  CANCELLED: { label: 'Cancelada', fg: '#6B7280', bg: '#F3F4F6' },
}

function quando(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `há ${m} min`
  if (m < 1440) return `há ${Math.floor(m / 60)}h`
  return new Date(iso).toLocaleDateString('pt-BR')
}

const telefone = (v?: string | null) => {
  const d = (v ?? '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return v ?? ''
}

/**
 * Bíblias de cortesia pedidas no cadastro.
 *
 * O pedido acontece quando a pessoa acabou de criar a conta e ainda não tem
 * endereço — por isso a tela separa quem está pronto para postar de quem ainda
 * precisa cadastrar o endereço. Sem essa separação, a lista pareceria cheia de
 * pedidos incompletos e não daria para saber o que dá para despachar hoje.
 */
export function Biblias() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<AdminBibleRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('PENDING')
  const [salvando, setSalvando] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setLoadError(false)
    try {
      setRows(await api.bibleRequests(filtro === 'TODOS' ? undefined : filtro))
    } catch {
      setLoadError(true)
      if (!silent) showToast('Erro ao carregar os pedidos', 'error')
    } finally {
      setLoading(false)
    }
  }, [filtro, showToast])

  useEffect(() => { load() }, [load])

  async function marcar(id: string, status: 'SENT' | 'CANCELLED' | 'PENDING') {
    setSalvando(id)
    try {
      await api.updateBibleRequest(id, { status })
      showToast(status === 'SENT' ? 'Marcada como enviada' : 'Pedido atualizado', 'success')
      await load(true)
    } catch {
      showToast('Não foi possível atualizar', 'error')
    } finally {
      setSalvando(null)
    }
  }

  const prontos = useMemo(
    () => rows.filter((r) => r.status === 'PENDING' && r.address).length,
    [rows],
  )
  const semEndereco = useMemo(
    () => rows.filter((r) => r.status === 'PENDING' && !r.address).length,
    [rows],
  )

  function copiarEtiqueta(r: AdminBibleRequest) {
    if (!r.address) return
    const txt = [r.user.name, r.address.linha1, r.address.linha2, `CEP ${r.address.cep}`, telefone(r.user.phone)]
      .filter(Boolean)
      .join('\n')
    navigator.clipboard?.writeText(txt)
      .then(() => showToast('Endereço copiado', 'success'))
      .catch(() => showToast('Não foi possível copiar', 'error'))
  }

  return (
    <div style={{ fontFamily: SANS, maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: TEXT, margin: 0 }}>Bíblias</h1>
        <button
          onClick={() => load()}
          style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '7px 14px', fontSize: 13, fontWeight: 700, color: MUTED, cursor: 'pointer', fontFamily: SANS }}
        >
          Atualizar
        </button>
      </div>
      <p style={{ fontSize: 13.5, color: MUTED, marginTop: 0, marginBottom: 18 }}>
        Clientes que pediram o exemplar de cortesia no cadastro. Marque como enviada depois de postar.
      </p>

      {semEndereco > 0 && filtro !== 'SENT' && (
        <div style={{
          background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12,
          padding: '12px 16px', marginBottom: 18, fontSize: 13.5, color: '#92400E', fontWeight: 600, lineHeight: 1.5,
        }}>
          {prontos} pronto(s) para postar · {semEndereco} esperando endereço.
          O pedido é feito no cadastro, antes de a pessoa cadastrar endereço — o endereço aparece aqui sozinho quando ela cadastrar.
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {(['PENDING', 'SENT', 'CANCELLED', 'TODOS'] as Filtro[]).map((f) => (
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
        <div style={{ color: MUTED, fontSize: 14 }}>Carregando…</div>
      ) : loadError ? (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 14.5, color: TEXT, fontWeight: 700, marginBottom: 4 }}>Não foi possível carregar</div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 14 }}>Verifique a conexão e tente de novo.</div>
          <button
            onClick={() => load()}
            style={{ background: O, color: '#fff', border: 'none', borderRadius: 9, padding: '8px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: SANS }}
          >
            Tentar novamente
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 28, textAlign: 'center', color: MUTED, fontSize: 14 }}>
          Nenhum pedido {filtro === 'TODOS' ? '' : `com o status "${STATUS[filtro].label.toLowerCase()}"`} por aqui.
        </div>
      ) : (
        rows.map((r) => {
          const st = STATUS[r.status] ?? STATUS.PENDING
          const ocupado = salvando === r.id
          return (
            <div
              key={r.id}
              style={{
                background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14,
                padding: 16, marginBottom: 10,
                display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: TEXT }}>{r.user.name}</span>
                  <span style={{ background: st.bg, color: st.fg, borderRadius: 20, padding: '3px 10px', fontSize: 11.5, fontWeight: 700 }}>
                    {st.label}
                  </span>
                </div>

                <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 8 }}>
                  {r.user.email}
                  {r.user.phone ? ` · ${telefone(r.user.phone)}` : ''}
                  {' · pediu '}{quando(r.createdAt)}
                </div>

                {r.address ? (
                  <div style={{ fontSize: 13.5, color: TEXT, lineHeight: 1.5 }}>
                    <div>{r.address.linha1}</div>
                    <div style={{ color: MUTED }}>{r.address.linha2}</div>
                    <div style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' }}>CEP {r.address.cep}</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: '#B45309', background: '#FEF3C7', borderRadius: 8, padding: '7px 11px', display: 'inline-block', fontWeight: 600 }}>
                    Sem endereço cadastrado ainda
                  </div>
                )}

                {r.notes && (
                  <div style={{ fontSize: 12.5, color: MUTED, marginTop: 8, fontStyle: 'italic' }}>{r.notes}</div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {r.address && (
                  <button
                    onClick={() => copiarEtiqueta(r)}
                    style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: MUTED, cursor: 'pointer', fontFamily: SANS }}
                  >
                    Copiar endereço
                  </button>
                )}
                {r.status === 'PENDING' ? (
                  <>
                    <button
                      onClick={() => marcar(r.id, 'SENT')}
                      disabled={ocupado || !r.address}
                      title={!r.address ? 'O cliente ainda não cadastrou endereço' : undefined}
                      style={{
                        background: r.address ? O : '#E5E0DA', color: '#fff', border: 'none', borderRadius: 9,
                        padding: '8px 16px', fontSize: 13.5, fontWeight: 800,
                        cursor: ocupado || !r.address ? 'default' : 'pointer', fontFamily: SANS,
                        opacity: ocupado ? 0.6 : 1,
                      }}
                    >
                      {ocupado ? 'Salvando…' : 'Marcar como enviada'}
                    </button>
                    <button
                      onClick={() => marcar(r.id, 'CANCELLED')}
                      disabled={ocupado}
                      style={{ background: 'transparent', border: 'none', fontSize: 13, fontWeight: 700, color: MUTED, cursor: 'pointer', fontFamily: SANS }}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => marcar(r.id, 'PENDING')}
                    disabled={ocupado}
                    style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 9, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: MUTED, cursor: 'pointer', fontFamily: SANS }}
                  >
                    Reabrir
                  </button>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
