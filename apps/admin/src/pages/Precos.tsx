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

function Field({ label, hint, value, onChange, suffix, step = '0.01' }: {
  label: string; hint?: string; value: number; onChange: (v: number) => void; suffix?: string; step?: string
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, display: 'block', marginBottom: 4 }}>{label}</label>
      {hint && <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 6 }}>{hint}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="number" step={step} min="0" value={Number.isFinite(value) ? value : 0}
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
  // 0 = PIX; 1..N = cartão em N vezes
  const [simInst, setSimInst] = useState(1)

  useEffect(() => {
    api.getSettings().then(setP).catch(() => showToast('Erro ao carregar preços', 'error'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof Pricing) => (v: number) => setP((cur) => (cur ? { ...cur, [k]: v } : cur))
  // Medidas do baú: a API só aceita inteiros.
  const setInt = (k: keyof Pricing) => (v: number) => set(k)(Math.round(v))

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
  // Pagamento (mesma conta de apps/api/src/payments/card-plan.ts): a loja paga a taxa
  // e fica com o juros do parcelado.
  const base = simSub + deliveryFee
  const i = p.cardInterestMonthlyPct / 100
  const withInterest = simInst > p.cardFreeInstallments && i > 0
  const parcela = simInst >= 1
    ? (withInterest ? Math.round(((base * i) / (1 - Math.pow(1 + i, -simInst))) * 100) / 100 : base / simInst)
    : 0
  const clientPays = simInst >= 1 && withInterest ? Math.round(parcela * simInst * 100) / 100 : base
  const interest = Math.round((clientPays - base) * 100) / 100
  const feePct = simInst <= 1 ? p.cardFeePct1x : simInst <= 6 ? p.cardFeePct2to6 : p.cardFeePct7to12
  // A loja paga a taxa só sobre a parte dela (produtos + juros); a do frete é da plataforma.
  const feeAll = (clientPays * feePct) / 100 + p.cardFeeFixed
  const payFee = simInst === 0 ? p.pixFee : (clientPays > 0 ? feeAll * Math.min(1, (simSub + interest) / clientPays) : 0)
  const storeGets = Math.max(0, simSub - commission + interest - payFee)
  // Plataforma paga a taxa sobre o frete do motoboy (no cartão).
  const platformKeeps = commission + (deliveryFee - courierFee) - (simInst === 0 ? 0 : feeAll - payFee)

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
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: -4, lineHeight: 1.5 }}>
              Este número aparece nos Termos do Lojista, que a loja aceita ao se cadastrar. Pelos
              próprios Termos, <strong>aumento de comissão precisa ser avisado com antecedência</strong>{' '}
              às lojas já cadastradas — avise antes de salvar.
            </div>
          </Section>

          <Section title="Cartão e parcelamento">
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
              <Field label="Parcelar até" value={p.cardMaxInstallments} onChange={setInt('cardMaxInstallments')} suffix="vezes" step="1" />
              <Field label="Sem juros até" value={p.cardFreeInstallments} onChange={setInt('cardFreeInstallments')} suffix="vezes" step="1" />
            </div>
            <Field
              label="Juros ao mês (acima das sem juros)"
              hint="Cobrado do cliente, que vê o valor antes de fechar. O juros vai para a loja, que paga a taxa maior do parcelado."
              value={p.cardInterestMonthlyPct} onChange={set('cardInterestMonthlyPct')} suffix="% ao mês"
            />
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: -4, lineHeight: 1.5 }}>
              Parcela mínima de R$ 5,00: em pedidos pequenos o app mostra menos opções.
            </div>
          </Section>

          <Section title="Taxas do pagamento (paga pela loja)">
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: -6, marginBottom: 12, lineHeight: 1.5 }}>
              Copie as taxas do seu plano no Asaas. Elas saem do repasse da loja, não da comissão.
              Durante a taxa promocional do Asaas, use os valores promocionais.
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
              <Field label="Cartão à vista" value={p.cardFeePct1x} onChange={set('cardFeePct1x')} suffix="%" />
              <Field label="Cartão 2 a 6x" value={p.cardFeePct2to6} onChange={set('cardFeePct2to6')} suffix="%" />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
              <Field label="Cartão 7 a 12x" value={p.cardFeePct7to12} onChange={set('cardFeePct7to12')} suffix="%" />
              <Field label="Fixo por cobrança" value={p.cardFeeFixed} onChange={set('cardFeeFixed')} suffix="R$" />
            </div>
            <Field
              label="PIX"
              hint="Valor fixo por PIX cobrado da loja. Deixe 0 para a plataforma continuar pagando."
              value={p.pixFee} onChange={set('pixFee')} suffix="R$"
            />
          </Section>

          <Section title="Segurança da entrega">
            <Field
              label="Teto para entrega por motoboy"
              hint="Acima deste valor de produtos, o cliente só pode retirar na loja (0 = sem limite)."
              value={p.maxDeliveryValue}
              onChange={set('maxDeliveryValue')}
              suffix="R$"
            />
          </Section>

          <Section title="Baú do entregador">
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: -6, marginBottom: 12, lineHeight: 1.5 }}>
              O lojista vê essas medidas ao cadastrar produto. O que não cabe no baú ele marca como
              "Entrega feita pela loja".
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
              <Field label="Largura" value={p.courierBoxWidthCm} onChange={setInt('courierBoxWidthCm')} suffix="cm" step="1" />
              <Field label="Altura" value={p.courierBoxHeightCm} onChange={setInt('courierBoxHeightCm')} suffix="cm" step="1" />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
              <Field label="Profundidade" value={p.courierBoxDepthCm} onChange={setInt('courierBoxDepthCm')} suffix="cm" step="1" />
              <Field label="Peso máximo" value={p.courierBoxMaxKg} onChange={setInt('courierBoxMaxKg')} suffix="kg" step="1" />
            </div>
          </Section>

          <Section title="Anúncios na vitrine">
            <Field label="Preço por dia" value={p.adPricePerDay} onChange={set('adPricePerDay')} suffix="R$ / dia" />
            <Field label="Mínimo de dias" value={p.adMinDays} onChange={set('adMinDays')} suffix="dias" />
            <Field
              label="Anúncios ao mesmo tempo"
              hint="Quantos giram juntos no carrossel. Com a vitrine cheia, o próximo pago entra quando abrir vaga."
              value={p.adSlots} onChange={set('adSlots')} suffix="vagas"
            />
            <Field
              label="Prazo para pagar"
              hint="Depois da aprovação. Passou do prazo, o pedido encerra sozinho."
              value={p.adPayDeadlineDays} onChange={set('adPayDeadlineDays')} suffix="dias"
            />
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: -4, lineHeight: 1.5 }}>
              Mudar o preço não altera pedidos já feitos — cada anúncio guarda o preço do dia em que foi pedido.
              Anúncio de {p.adMinDays} dias hoje: <strong>{money(p.adPricePerDay * p.adMinDays)}</strong>.
            </div>
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
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, display: 'block', marginBottom: 4 }}>Pagamento</label>
              <select
                value={simInst} onChange={(e) => setSimInst(parseInt(e.target.value, 10))}
                style={{ border: `1.5px solid ${BORDER}`, borderRadius: 9, padding: '9px 12px', fontSize: 14, color: TEXT, fontFamily: SANS, background: CARD }}
              >
                <option value={0}>PIX</option>
                {Array.from({ length: Math.max(1, p.cardMaxInstallments) }, (_, k) => k + 1).map((n) => (
                  <option key={n} value={n}>Cartão {n}x{n === 1 ? ' (à vista)' : n <= p.cardFreeInstallments ? ' sem juros' : ' com juros'}</option>
                ))}
              </select>
            </div>
            {[
              { l: 'Cliente paga', v: clientPays, c: TEXT, b: true },
              { l: 'Taxa de entrega', v: deliveryFee, c: MUTED },
              ...(interest > 0 ? [{ l: `Juros (${simInst}x de ${money(parcela)})`, v: interest, c: MUTED }] : []),
              { l: 'Taxa do pagamento (loja paga)', v: payFee, c: MUTED },
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
