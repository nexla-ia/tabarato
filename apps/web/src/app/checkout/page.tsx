'use client'
import { useState, useEffect, useRef, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, CreditCard, Copy, Check, Clock, ShoppingBag } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { api } from '@/lib/api'
import { useCartStore } from '@/stores/cart'
import { promoDiscountFor } from '@/lib/promo'
import { useAuth } from '@/hooks/useAuth'
import { validateCardForm } from '@/lib/cardValidation'
import { geocodeAddress } from '@/lib/geocoding'
import Image from 'next/image'
import Script from 'next/script'
import styles from './page.module.css'

declare global {
  interface Window { MP_DEVICE_SESSION_ID?: string }
}

const MP_PUBLIC_KEY = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? ''

function fmtBRL(v: number | string) { return `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}` }
function fmtCpf(v: string) { return v.replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4') }
function fmtCard(v: string) { return v.replace(/\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim() }
function fmtExpiry(v: string) { const d = v.replace(/\D/g,'').slice(0,4); return d.length > 2 ? `${d.slice(0,2)}/${d.slice(2)}` : d }
function fmtCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

type PayMethod = 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD'

interface Address { id: string; label: string; street: string; number: string; district: string; city: string }

async function tokenizeCard(data: { cardNumber: string; cvv: string; expiryMonth: string; expiryYear: string; holderName: string; cpf: string }) {
  const res = await fetch(`https://api.mercadopago.com/v1/card_tokens?public_key=${MP_PUBLIC_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      card_number: data.cardNumber.replace(/\s/g,''),
      security_code: data.cvv,
      expiration_month: parseInt(data.expiryMonth),
      expiration_year: parseInt(data.expiryYear.length === 2 ? `20${data.expiryYear}` : data.expiryYear),
      cardholder: { name: data.holderName.toUpperCase(), identification: { type: 'CPF', number: data.cpf.replace(/\D/g,'') } },
    }),
  })
  const json = await res.json()
  if (!res.ok || !json.id) throw new Error(json.cause?.[0]?.description ?? 'Erro ao tokenizar cartão')
  return json.id as string
}

// Espelha o cálculo de frete do backend (orders.service: BASE 10 + 2/km).
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}
function calcDeliveryFee(distanceKm: number): number {
  return Math.round((10 + distanceKm * 2) * 100) / 100
}

export default function CheckoutPage() {
  const router = useRouter()
  const { stores, clear } = useCartStore()
  const { user, ready } = useAuth()

  const total = () => stores.reduce((acc, s) => acc + s.items.reduce((a, i) => a + i.price * i.quantity, 0), 0)
  const promoTotal = () => Math.round(stores.reduce((acc, s) =>
    acc + s.items.reduce((a, i) => a + promoDiscountFor(i.quantity, i.price, i.promoBuyQty, i.promoPayQty), 0), 0) * 100) / 100

  // Chave de idempotência: estável entre retries do mesmo checkout (evita pedido duplicado)
  const idemKey = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`)

  // Exige login pra finalizar o pedido — volta pro checkout após autenticar.
  useEffect(() => {
    if (ready && !user) router.push('/login?redirect=/checkout')
  }, [ready, user, router])

  const [addresses, setAddresses] = useState<Address[]>([])
  const [selectedAddr, setSelectedAddr] = useState('')
  const [payMethod, setPayMethod] = useState<PayMethod>('PIX')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Fidelidade: 100 pontos = R$10, resgate só em blocos de 100.
  const [loyaltyPoints, setLoyaltyPoints] = useState(0)
  const [pointsToRedeem, setPointsToRedeem] = useState(0)

  // Agendamento (opcional): entrega imediata por padrão.

  // Card fields
  const [cardNumber, setCardNumber] = useState('')
  const [cardHolder, setCardHolder] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [cardCpf, setCardCpf] = useState('')
  const [installments, setInstallments] = useState(1)

  // New address
  const [showAddrForm, setShowAddrForm] = useState(false)
  const [addrForm, setAddrForm] = useState({ label: 'Casa', street: '', number: '', district: '', city: 'Vilhena', state: 'RO', zipCode: '', lat: -12.7406, lng: -60.1478 })
  const [savingAddr, setSavingAddr] = useState(false)

  // PIX result — 1 pagamento pode cobrir vários pedidos (1 por loja)
  const [pixResult, setPixResult] = useState<{
    orderIds: string[]; pixCode: string; pixQrBase64?: string
    totalAmount?: number; pixExpiresAt?: string
  } | null>(null)
  const [pixCopied, setPixCopied] = useState(false)
  // Só conta o relógio enquanto a tela do PIX está aberta — sem isso o
  // interval ficaria rodando à toa durante o resto do checkout.
  const [pixNow, setPixNow] = useState(() => Date.now())
  useEffect(() => {
    if (!pixResult?.pixExpiresAt) return
    const t = setInterval(() => setPixNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [pixResult?.pixExpiresAt])
  const [polling, setPolling] = useState(false)
  const [storeCoords, setStoreCoords] = useState<Record<string, { lat: number; lng: number }>>({})

  const isCard = payMethod === 'CREDIT_CARD' || payMethod === 'DEBIT_CARD'
  // Teto do cliente é só uma estimativa (o back é quem valida de verdade): não
  // deixa resgatar mais pontos do que o saldo, nem mais que ~o subtotal em blocos de 100.
  // Fidelidade só pode cobrir o que resta APÓS promoção e cupom (senão a UI mostra
  // mais desconto do que o backend aplica). Bloco de 100 pts = R$10.
  const couponsTotal = stores.reduce((acc, s) => acc + (s.coupon?.discount ?? 0), 0)
  const netPayable = Math.max(0, total() - promoTotal() - couponsTotal)
  const maxRedeemable = Math.min(loyaltyPoints, Math.floor(netPayable / 10) * 100)

  // Frete real por loja (10 + 2/km) — precisa das coords da loja + do endereço.
  const selAddr = addresses.find((a) => a.id === selectedAddr)
  const perStoreDelivery = stores.map((s) => {
    const c = storeCoords[s.storeId]
    const delivery = (c && (selAddr as any)?.lat != null && (selAddr as any)?.lng != null)
      ? calcDeliveryFee(haversineKm(c.lat, c.lng, (selAddr as any).lat, (selAddr as any).lng))
      : null
    return { delivery, freeShip: !!s.coupon?.freeShipping }
  })
  const deliveryKnown = !!selAddr && perStoreDelivery.length > 0 && perStoreDelivery.every((x) => x.delivery != null)
  const deliveryCharged = deliveryKnown
    ? Math.round(perStoreDelivery.reduce((a, x) => a + (x.freeShip ? 0 : (x.delivery ?? 0)), 0) * 100) / 100
    : 0
  const loyaltyDiscount = (pointsToRedeem / 100) * 10
  // Subtotal já líquido de promoção e cupom, mas ainda SEM a entrega nem os
  // pontos de fidelidade (a fidelidade só é escolhida mais abaixo, depois da
  // entrega). Existe só pra deixar a conta rastreável na tela — sem essa linha
  // o cliente via "Subtotal" cheio, depois "Cupom -R$X" e tinha que subtrair
  // de cabeça pra saber quanto ia entrar na entrega.
  const productSubtotal = Math.max(0, Math.round((total() - promoTotal() - couponsTotal) * 100) / 100)
  const productNet = Math.max(0, Math.round((total() - promoTotal() - couponsTotal - loyaltyDiscount) * 100) / 100)
  const estimatedTotal = Math.round((productNet + deliveryCharged) * 100) / 100

  useEffect(() => {
    api.get<Address[]>('/users/me/addresses').then(r => {
      setAddresses(r.data)
      if (r.data.length > 0) setSelectedAddr(r.data.find(a => (a as any).isDefault)?.id ?? r.data[0].id)
    }).catch(() => {})

    api.get<{ points: number }>('/users/me/loyalty').then(r => setLoyaltyPoints(r.data.points)).catch(() => {})
  }, [])

  // Coordenadas de cada loja do carrinho — pra estimar o frete real (10 + 2/km) por
  // loja e mostrar um total confiável (o backend cobra por esse mesmo cálculo).
  const storeIdsKey = stores.map(s => s.storeId).join(',')
  useEffect(() => {
    const ids = [...new Set(stores.map(s => s.storeId))]
    ids.forEach((id) => {
      if (storeCoords[id]) return
      api.get(`/stores/${id}`).then((r) => {
        const { lat, lng } = r.data ?? {}
        if (typeof lat === 'number' && typeof lng === 'number') {
          setStoreCoords((prev) => ({ ...prev, [id]: { lat, lng } }))
        }
      }).catch(() => {})
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeIdsKey])

  // PIX: verifica o pagamento automaticamente (o webhook pode demorar/faltar). Se
  // o backend marcar como pago → vai pro pedido; se expirar/recusar (FAILED) → avisa.
  useEffect(() => {
    if (!pixResult) return
    const iv = setInterval(async () => {
      try {
        const { data } = await api.get(`/payments/orders/${pixResult.orderIds[0]}/sync`)
        if (data?.status === 'PAID') {
          clearInterval(iv)
          router.push(pixResult.orderIds.length === 1 ? `/orders/${pixResult.orderIds[0]}` : '/orders')
        } else if (data?.status === 'FAILED') {
          clearInterval(iv)
          setError('O pagamento PIX não foi confirmado (expirou ou foi recusado). Refaça o pedido.')
        }
      } catch { /* rede instável: tenta de novo no próximo tick */ }
    }, 5000)
    return () => clearInterval(iv)
  }, [pixResult, router])

  async function saveAddress(e: FormEvent) {
    e.preventDefault()
    setSavingAddr(true)
    try {
      // Geocodifica o endereço digitado — sem isso, taxa de entrega e taxa do
      // entregador são calculadas com base num ponto fixo (centro de Vilhena)
      // em vez da distância real até a casa do cliente. Falha na geocodificação
      // não bloqueia o cadastro: cai no fallback já preenchido em addrForm.
      const query = `${addrForm.street}, ${addrForm.number}, ${addrForm.district}, ${addrForm.city} - ${addrForm.state}, ${addrForm.zipCode}, Brasil`
      const coords = await geocodeAddress(query)
      const { data } = await api.post<Address>('/users/me/addresses', {
        ...addrForm,
        ...(coords ?? {}),
        isDefault: addresses.length === 0,
      })
      setAddresses(prev => [...prev, data])
      setSelectedAddr(data.id)
      setShowAddrForm(false)
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Erro ao salvar endereço')
    } finally { setSavingAddr(false) }
  }

  async function handleSubmit() {
    if (!selectedAddr) { setError('Selecione um endereço de entrega'); return }
    if (stores.length === 0) { setError('Carrinho vazio'); return }

    if (isCard) {
      if (!cardHolder.trim()) { setError('Nome no cartão obrigatório'); return }
      const cardErrors = validateCardForm({ cardNumber, expiry: cardExpiry, cvv: cardCvv, cpf: cardCpf })
      const firstError = cardErrors.cardNumber ?? cardErrors.expiry ?? cardErrors.cvv ?? cardErrors.cpf
      if (firstError) { setError(firstError); return }
    }

    setLoading(true); setError('')
    try {
      let cardToken: string | undefined
      if (isCard) {
        const [month, year] = cardExpiry.split('/')
        cardToken = await tokenizeCard({ cardNumber, cvv: cardCvv, expiryMonth: month.trim(), expiryYear: year.trim(), holderName: cardHolder, cpf: cardCpf })
      }

      // Carrinho multi-loja: 1 grupo por loja, todos sob 1 pagamento (createMulti no back).
      const { data } = await api.post('/orders', {
        groups: stores.map(s => ({
          storeId: s.storeId,
          items: s.items.map(i => ({ productId: i.productId, variationId: i.variationId, quantity: i.quantity })),
          couponCode: s.coupon?.code,
        })),
        addressId: selectedAddr,
        paymentMethod: payMethod,
        cardToken,
        installments: isCard ? installments : undefined,
        payerCpf: isCard ? cardCpf : undefined,
        idempotencyKey: idemKey.current,
        // Fingerprint do dispositivo (security.js do MP) — reduz recusa de cartão
        // por antifraude (cc_rejected_high_risk). Só existe depois do script carregar.
        deviceId: typeof window !== 'undefined' ? window.MP_DEVICE_SESSION_ID : undefined,
        pointsToRedeem: pointsToRedeem > 0 ? pointsToRedeem : undefined,
      })

      const orders: { id: string }[] = data.orders
      clear()

      if (payMethod === 'PIX' && data.payment?.pixCode) {
        setPixResult({
          orderIds: orders.map(o => o.id), pixCode: data.payment.pixCode, pixQrBase64: data.payment.pixQrBase64,
          totalAmount: data.payment.amount != null ? Number(data.payment.amount) : undefined,
          pixExpiresAt: data.payment.pixExpiresAt,
        })
      } else if (orders.length === 1) {
        router.push(`/orders/${orders[0].id}`)
      } else {
        router.push('/orders')
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? err.message ?? 'Não foi possível finalizar o pedido')
      // Regenera a chave: o backend recusa reenvio da MESMA chave após uma tentativa
      // morta (cartão recusado / PIX falho). Sem isso o cliente trava até recarregar.
      idemKey.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    } finally { setLoading(false) }
  }

  async function handleCheckPix() {
    if (!pixResult) return
    setPolling(true)
    try {
      const { data } = await api.get(`/payments/orders/${pixResult.orderIds[0]}/sync`)
      if (data?.status === 'PAID') {
        router.push(pixResult.orderIds.length === 1 ? `/orders/${pixResult.orderIds[0]}` : '/orders')
      } else {
        setError('Pagamento ainda não confirmado. Aguarde alguns instantes.')
      }
    } catch {} finally { setPolling(false) }
  }

  function copyPix() {
    navigator.clipboard.writeText(pixResult?.pixCode ?? '')
    setPixCopied(true)
    setTimeout(() => setPixCopied(false), 2500)
  }

  // PIX screen
  if (pixResult) {
    const orderHref = pixResult.orderIds.length === 1 ? `/orders/${pixResult.orderIds[0]}` : '/orders'
    const refLabel = pixResult.orderIds.length === 1
      ? `#${pixResult.orderIds[0].slice(-6).toUpperCase()}`
      : pixResult.orderIds.map(id => `#${id.slice(-6).toUpperCase()}`).join(' · ')
    const expiresAtMs = pixResult.pixExpiresAt ? new Date(pixResult.pixExpiresAt).getTime() : null
    const remainingMs = expiresAtMs != null ? expiresAtMs - pixNow : null
    const expired = remainingMs != null && remainingMs <= 0
    const urgent = remainingMs != null && remainingMs > 0 && remainingMs <= 5 * 60_000

    return (
      <>
        <Navbar />
        <div className={styles.pixPage}>
          <div className={styles.pixCard}>
            <div className={styles.pixHead}>
              <span className={styles.pixBadge}><Zap size={20} /></span>
              <div className={styles.pixHeadText}>
                <h2 className={styles.pixTitle}>
                  {pixResult.orderIds.length > 1 ? `${pixResult.orderIds.length} pedidos criados` : 'Pedido criado'}
                </h2>
                <span className={styles.pixRef}>{refLabel}</span>
              </div>
            </div>

            {pixResult.totalAmount != null && (
              <div className={styles.pixAmount}>
                <span className={styles.pixAmountLabel}>Total a pagar via PIX</span>
                <span className={styles.pixAmountValue}>{fmtBRL(pixResult.totalAmount)}</span>
              </div>
            )}

            {expired ? (
              <div className={styles.pixExpired}>
                <Clock size={26} />
                <p className={styles.pixExpiredTitle}>Código PIX expirado</p>
                <p className={styles.pixExpiredSub}>
                  O prazo de 30 minutos pra pagar esse código acabou. O pedido continua registrado —
                  acompanhe o status ou fale com a loja pelo chat do pedido.
                </p>
                <a href={orderHref} className={styles.confirmBtn}>
                  <ShoppingBag size={16} /> Ver pedido
                </a>
              </div>
            ) : (
              <>
                {remainingMs != null && (
                  <div className={`${styles.pixTimer} ${urgent ? styles.pixTimerUrgent : ''}`}>
                    <Clock size={13} /> Expira em <strong>{fmtCountdown(remainingMs)}</strong>
                  </div>
                )}

                {pixResult.pixQrBase64 && (
                  <div className={styles.pixQrFrame}>
                    <Image src={`data:image/png;base64,${pixResult.pixQrBase64}`} alt="QR Code PIX" width={196} height={196} />
                  </div>
                )}
                <p className={styles.pixSub}>Escaneie com o app do seu banco ou copie o código abaixo</p>

                <button className={styles.copyBtn} onClick={copyPix}>
                  {pixCopied ? <><Check size={16} /> Copiado</> : <><Copy size={16} /> Copiar código PIX</>}
                </button>
                {error && <div className={styles.errorBox}>{error}</div>}
                <button className={styles.confirmBtn} onClick={handleCheckPix} disabled={polling}>
                  {polling ? 'Verificando...' : 'Já paguei — verificar pagamento'}
                </button>
                <a href={orderHref} className={styles.laterLink}>Ver pedido depois</a>
              </>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Navbar />
      {/* Fingerprint do dispositivo pro antifraude do MP — carrega assim que a tela de pagamento abre */}
      <Script src="https://www.mercadopago.com/v2/security.js" strategy="afterInteractive" {...{ view: 'checkout' }} />
      <div className="container" style={{ padding: '32px 20px 60px', maxWidth: 680 }}>
        <h1 className={styles.title}>Finalizar pedido</h1>

        {/* Address */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}><span className={styles.stepNum}>1</span> Endereço de entrega</h2>
          {addresses.map(a => (
            <label key={a.id} className={`${styles.addrCard} ${selectedAddr === a.id ? styles.addrSelected : ''}`}>
              <input type="radio" name="addr" value={a.id} checked={selectedAddr === a.id} onChange={() => setSelectedAddr(a.id)} style={{ display: 'none' }} />
              <div className={styles.addrRadio}>{selectedAddr === a.id && <div className={styles.addrRadioInner} />}</div>
              <div>
                <div className={styles.addrLabel}>{a.label}</div>
                <div className={styles.addrLine}>{a.street}, {a.number} — {a.district}, {a.city}</div>
              </div>
            </label>
          ))}
          <button className={styles.addAddrBtn} onClick={() => setShowAddrForm(!showAddrForm)}>+ Adicionar endereço</button>

          {showAddrForm && (
            <form className={styles.addrForm} onSubmit={saveAddress}>
              {[
                { label: 'Identificação', key: 'label', placeholder: 'Ex: Casa', required: true },
                { label: 'CEP', key: 'zipCode', placeholder: '76980-000', required: true },
                { label: 'Rua', key: 'street', placeholder: 'Av. Major Amarante', required: true },
                { label: 'Número', key: 'number', placeholder: '123', required: true },
                { label: 'Bairro', key: 'district', placeholder: 'Centro', required: true },
                { label: 'Cidade', key: 'city', placeholder: 'Vilhena', required: true },
              ].map(f => (
                <div key={f.key} className={styles.field}>
                  <label className={styles.fieldLabel}>{f.label}</label>
                  <input className={styles.input} required={f.required} placeholder={f.placeholder} value={(addrForm as any)[f.key]} onChange={e => setAddrForm(p => ({ ...p, [f.key]: e.target.value }))} />
                </div>
              ))}
              <button type="submit" className={styles.saveAddrBtn} disabled={savingAddr}>{savingAddr ? 'Salvando...' : 'Salvar endereço'}</button>
            </form>
          )}
        </section>

        {/* Payment */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}><span className={styles.stepNum}>2</span> Forma de pagamento</h2>
          <div className={styles.pmGrid}>
            <button
              className={`${styles.pmCard} ${payMethod === 'PIX' ? styles.pmCardActive : ''}`}
              onClick={() => setPayMethod('PIX')}
            >
              <div className={styles.pmIcon} style={{ background: '#D1FAE5', color: '#059669' }}><Zap size={22} /></div>
              <div className={styles.pmLabel}>PIX</div>
              <div className={styles.pmDesc}>Aprovação na hora</div>
            </button>
            <button
              className={`${styles.pmCard} ${isCard ? styles.pmCardActive : ''}`}
              onClick={() => setPayMethod(isCard ? payMethod : 'CREDIT_CARD')}
            >
              <div className={styles.pmIcon} style={{ background: '#DBEAFE', color: '#2563EB' }}><CreditCard size={22} /></div>
              <div className={styles.pmLabel}>Cartão</div>
              <div className={styles.pmDesc}>Crédito ou débito</div>
            </button>
          </div>

          {isCard && (
            <div className={styles.cardForm}>
              <div className={styles.cardTypeToggle}>
                <button
                  type="button"
                  className={`${styles.cardTypeBtn} ${payMethod === 'CREDIT_CARD' ? styles.cardTypeBtnActive : ''}`}
                  onClick={() => setPayMethod('CREDIT_CARD')}
                >
                  Crédito
                </button>
                <button
                  type="button"
                  className={`${styles.cardTypeBtn} ${payMethod === 'DEBIT_CARD' ? styles.cardTypeBtnActive : ''}`}
                  onClick={() => setPayMethod('DEBIT_CARD')}
                >
                  Débito
                </button>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Número do cartão</label>
                <input className={styles.input} value={cardNumber} onChange={e => setCardNumber(fmtCard(e.target.value))} placeholder="0000 0000 0000 0000" maxLength={19} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Nome no cartão</label>
                <input className={styles.input} value={cardHolder} onChange={e => setCardHolder(e.target.value)} placeholder="Como aparece no cartão" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Validade</label>
                  <input className={styles.input} value={cardExpiry} onChange={e => setCardExpiry(fmtExpiry(e.target.value))} placeholder="MM/AA" maxLength={5} />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>CVV</label>
                  <input className={styles.input} value={cardCvv} onChange={e => setCardCvv(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="123" maxLength={4} type="password" />
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>CPF do titular</label>
                <input className={styles.input} value={cardCpf} onChange={e => setCardCpf(fmtCpf(e.target.value))} placeholder="000.000.000-00" maxLength={14} />
              </div>
              {payMethod === 'CREDIT_CARD' && (
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Parcelas</label>
                  <div className={styles.installRow}>
                    {[1,2,3,6,12].map(n => (
                      <button key={n} className={`${styles.installChip} ${installments===n ? styles.installChipActive : ''}`} onClick={() => setInstallments(n)}>{n}x</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Summary */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}><span className={styles.stepNum}>3</span> Resumo</h2>
          <div className={styles.summaryCard}>
            {stores.map(s => (
              <div key={s.storeId}>
                {stores.length > 1 && <div className={styles.summaryStoreLabel}>{s.storeName}</div>}
                {s.items.map(i => (
                  <div key={`${i.productId}-${i.variationId}`} className={styles.summaryItem}>
                    <span className={styles.summaryQty}>{i.quantity}x</span>
                    <span className={styles.summaryName}>{i.name}{i.variationName ? ` · ${i.variationName}` : ''}</span>
                    <span>{fmtBRL(i.price * i.quantity)}</span>
                  </div>
                ))}
                {s.coupon && (
                  <div className={styles.summaryRow}>
                    <span>Cupom {s.coupon.code}</span>
                    <span>{s.coupon.discount > 0 ? `-${fmtBRL(s.coupon.discount)}` : ''}{s.coupon.freeShipping ? (s.coupon.discount > 0 ? ' + frete grátis' : 'Frete grátis') : ''}</span>
                  </div>
                )}
              </div>
            ))}
            <div className={styles.summaryDivider} />
            <div className={styles.summaryRow}>
              <span>Subtotal</span><span>{fmtBRL(total())}</span>
            </div>
            {promoTotal() > 0 && (
              <div className={styles.summaryRow} style={{ color: '#15803D', fontWeight: 700 }}>
                <span>🏷️ Promoções</span><span>-{fmtBRL(promoTotal())}</span>
              </div>
            )}
            {(promoTotal() > 0 || couponsTotal > 0) && (
              <div className={styles.summaryRow} style={{ fontWeight: 700 }}>
                <span>Total dos produtos</span><span>{fmtBRL(productSubtotal)}</span>
              </div>
            )}
            <div className={styles.summaryRow}>
              <span>Entrega{stores.length > 1 ? ` (${stores.length} lojas)` : ''}</span>
              <span>{!deliveryKnown ? 'Calculando…' : deliveryCharged === 0 ? 'Grátis' : fmtBRL(deliveryCharged)}</span>
            </div>

            {maxRedeemable >= 100 && (
              <>
                <div className={styles.summaryDivider} />
                <div className={styles.loyaltyRow}>
                  <div className={styles.loyaltyInfo}>
                    <span className={styles.loyaltyLabel}>Usar pontos de fidelidade</span>
                    <span className={styles.loyaltyBalance}>Saldo: {loyaltyPoints} pts (100 pts = R$10)</span>
                  </div>
                  <div className={styles.loyaltyStepper}>
                    <button
                      type="button" className={styles.loyaltyStepBtn}
                      onClick={() => setPointsToRedeem(p => Math.max(0, p - 100))}
                      disabled={pointsToRedeem <= 0}
                    >−</button>
                    <span className={styles.loyaltyStepVal}>{pointsToRedeem}</span>
                    <button
                      type="button" className={styles.loyaltyStepBtn}
                      onClick={() => setPointsToRedeem(p => Math.min(maxRedeemable, p + 100))}
                      disabled={pointsToRedeem >= maxRedeemable}
                    >+</button>
                  </div>
                </div>
                {pointsToRedeem > 0 && (
                  <div className={styles.summaryRow}>
                    <span>Desconto por pontos</span><span>-{fmtBRL(pointsToRedeem / 100 * 10)}</span>
                  </div>
                )}
              </>
            )}
            <div className={styles.summaryDivider} />
            <div className={styles.summaryRow} style={{ fontWeight: 800, fontSize: 16 }}>
              <span>{deliveryKnown ? 'Total' : 'Total (sem entrega)'}</span>
              <span>{fmtBRL(deliveryKnown ? estimatedTotal : productNet)}</span>
            </div>
            {!deliveryKnown && (
              <div className={styles.summaryRow} style={{ fontSize: 12, color: 'var(--muted, #999)' }}>
                <span>Entrega sendo calculada…</span><span />
              </div>
            )}
          </div>
        </section>

        {error && <div className={styles.errorBox}>{error}</div>}

        <button className={styles.submitBtn} onClick={handleSubmit} disabled={loading || (!!selectedAddr && !deliveryKnown)}>
          {loading ? 'Processando...' : (!!selectedAddr && !deliveryKnown) ? 'Calculando entrega…' : `Confirmar pedido${deliveryKnown ? ` · ${fmtBRL(estimatedTotal)}` : ''}`}
        </button>
      </div>
    </>
  )
}
