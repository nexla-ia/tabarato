import { useEffect, useState } from 'react'
import { api, type Pricing } from '../api'
import { useToast } from '../context/ToastContext'

const O = '#FF6600'
const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const BORDER = '#F0E8E0'
const CARD = '#FFFFFF'
const GREEN = '#16A34A'
const SANS = "'DM Sans', sans-serif"

const money = (v: number) => `R$ ${(Math.round(v * 100) / 100).toFixed(2).replace('.', ',')}`

function Field({ label, hint, value, onChange, suffix }: {
  label: string; hint?: string; value: number; onChange: (v: number) => void; suffix?: string
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, display: 'block', marginBottom: 4 }}>{label}</label>
      {hint && <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 6 }}>{hint}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="number" step="0.01" min="0" value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ width: 140, border: `1.5px solid ${BORDER}`, borderRadius: 9, padding: '9px 12px', fontSize: 14, color: TEXT, fontFamily: SANS }}
        />
        {suffix && <span style={{ fontSize: 13, color: MUTED }}>{suffix}</span>}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 18, marginBottom: 16 }}>
      <h2 style={{ fontSize: 13, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 14px' }}>{title}</h2>
      {children}
    </div>
  )
}

export function Precos() {
  const { showToast } = useToast()
  const [p, setP] = useState<Pricing | null>(null)
  const [saving, setSaving] = useState(false)
  // Simulação (não é salvo — só pro preview)
  const [simSub, setSimSub] = useState(50)
  const [simKm, setSimKm] = useState(3)

  useEffect(() => {
    api.getSettings().then(setP).catch(() => showToast('Erro ao carregar preços', 'error'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof Pricing) => (v: number) => setP((cur) => (cur ? { ...cur, [k]: v } : cur))

  async function save() {
    if (!p) return
    setSaving(true)
    try {
      const saved = await api.updateSettings(p)
      setP(saved)
      showToast('Preços atualizados!', 'success')
    } catch (e) {
      showToast((e as Error).message || 'Erro ao salvar', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!p) return <div style={{ fontFamily: SANS, color: MUTED, padding: 40 }}>Carregando…</div>

  // Preview do rateio (mesma conta do backend)
  const deliveryFee = Math.max(p.deliveryMinFee, p.deliveryBaseFee + simKm * p.deliveryPerKm)
  const courierFee = p.courierBaseFee + simKm * p.courierPerKm
  const commission = (simSub * p.platformCommissionPct) / 100
  const clientPays = simSub + deliveryFee
  const storeGets = Math.max(0, simSub - commission)
  const platformKeeps = commission + (deliveryFee - courierFee)

  return (
    <div style={{ fontFamily: SANS, maxWidth: 900 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: TEXT, margin: '0 0 4px' }}>Preços</h1>
      <p style={{ fontSize: 13.5, color: MUTED, marginTop: 0, marginBottom: 20 }}>
        Taxa de entrega, repasse ao motoboy e comissão. Vale para os próximos pedidos (sem redeploy).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div>
          <Section title="Entrega (cobrada do cliente)">
            <Field label="Taxa base" value={p.deliveryBaseFee} onChange={set('deliveryBaseFee')} suffix="R$" />
            <Field label="Por km" value={p.deliveryPerKm} onChange={set('deliveryPerKm')} suffix="R$ / km" />
            <Field label="Taxa mínima" hint="Piso da entrega, mesmo perto." value={p.deliveryMinFee} onChange={set('deliveryMinFee')} suffix="R$" />
          </Section>

          <Section title="Repasse ao motoboy">
            <Field label="Base" value={p.courierBaseFee} onChange={set('courierBaseFee')} suffix="R$" />
            <Field label="Por km" value={p.courierPerKm} onChange={set('courierPerKm')} suffix="R$ / km" />
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: -4 }}>
              Se o repasse for menor que a taxa cobrada, a diferença fica com a plataforma.
            </div>
          </Section>

          <Section title="Comissão da plataforma">
            <Field label="Comissão sobre os produtos" value={p.platformCommissionPct} onChange={set('platformCommissionPct')} suffix="%" />
          </Section>

          <button
            onClick={save} disabled={saving}
            style={{ background: O, color: '#fff', border: 'none', borderRadius: 11, padding: '12px 24px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: SANS, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Salvando…' : 'Salvar preços'}
          </button>
        </div>

        {/* Preview */}
        <div style={{ position: 'sticky', top: 0 }}>
          <Section title="Simulação de um pedido">
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <Field label="Produtos" value={simSub} onChange={(v) => setSimSub(v || 0)} suffix="R$" />
              <Field label="Distância" value={simKm} onChange={(v) => setSimKm(v || 0)} suffix="km" />
            </div>
            {[
              { l: 'Cliente paga', v: clientPays, c: TEXT, b: true },
              { l: 'Taxa de entrega', v: deliveryFee, c: MUTED },
              { l: 'Loja recebe', v: storeGets, c: GREEN },
              { l: 'Motoboy recebe', v: courierFee, c: GREEN },
              { l: 'Plataforma fica', v: platformKeeps, c: O, b: true },
            ].map((r) => (
              <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 13.5, color: MUTED, fontWeight: r.b ? 700 : 500 }}>{r.l}</span>
                <span style={{ fontSize: 14, color: r.c, fontWeight: r.b ? 800 : 700 }}>{money(r.v)}</span>
              </div>
            ))}
            <div style={{ fontSize: 11, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>
              *A loja também absorve cupons/promoções dela e o frete quando o cupom é "frete grátis".
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
