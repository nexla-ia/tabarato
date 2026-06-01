'use client'
import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import { api } from '@/lib/api'
import { useCartStore } from '@/stores/cart'
import Image from 'next/image'
import styles from './page.module.css'

const MP_PUBLIC_KEY = 'APP_USR-7286d9e5-0638-48bc-81c3-0408a661d48c'

function fmtBRL(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}` }
function fmtCpf(v: string) { return v.replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4') }
function fmtCard(v: string) { return v.replace(/\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim() }
function fmtExpiry(v: string) { const d = v.replace(/\D/g,'').slice(0,4); return d.length > 2 ? `${d.slice(0,2)}/${d.slice(2)}` : d }

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

export default function CheckoutPage() {
  const router = useRouter()
  const { items, storeId, total, clear } = useCartStore()

  const [addresses, setAddresses] = useState<Address[]>([])
  const [selectedAddr, setSelectedAddr] = useState('')
  const [payMethod, setPayMethod] = useState<PayMethod>('PIX')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  // PIX result
  const [pixOrder, setPixOrder] = useState<{ id: string; payment: { pixCode: string; pixQrBase64?: string } } | null>(null)
  const [pixCopied, setPixCopied] = useState(false)
  const [polling, setPolling] = useState(false)

  const isCard = payMethod === 'CREDIT_CARD' || payMethod === 'DEBIT_CARD'

  useEffect(() => {
    api.get<Address[]>('/users/me/addresses').then(r => {
      setAddresses(r.data)
      if (r.data.length > 0) setSelectedAddr(r.data.find(a => (a as any).isDefault)?.id ?? r.data[0].id)
    }).catch(() => {})
  }, [])

  async function saveAddress(e: FormEvent) {
    e.preventDefault()
    setSavingAddr(true)
    try {
      const { data } = await api.post<Address>('/users/me/addresses', { ...addrForm, isDefault: addresses.length === 0 })
      setAddresses(prev => [...prev, data])
      setSelectedAddr(data.id)
      setShowAddrForm(false)
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Erro ao salvar endereço')
    } finally { setSavingAddr(false) }
  }

  async function handleSubmit() {
    if (!selectedAddr) { setError('Selecione um endereço de entrega'); return }
    if (!storeId) { setError('Carrinho vazio'); return }

    if (isCard) {
      if (!cardNumber || cardNumber.replace(/\s/g,'').length < 13) { setError('Número do cartão inválido'); return }
      if (!cardHolder.trim()) { setError('Nome no cartão obrigatório'); return }
      if (!cardExpiry || cardExpiry.length < 5) { setError('Validade inválida'); return }
      if (!cardCvv || cardCvv.length < 3) { setError('CVV inválido'); return }
      if (!cardCpf || cardCpf.replace(/\D/g,'').length < 11) { setError('CPF obrigatório'); return }
    }

    setLoading(true); setError('')
    try {
      let cardToken: string | undefined
      if (isCard) {
        const [month, year] = cardExpiry.split('/')
        cardToken = await tokenizeCard({ cardNumber, cvv: cardCvv, expiryMonth: month.trim(), expiryYear: year.trim(), holderName: cardHolder, cpf: cardCpf })
      }

      const { data: order } = await api.post('/orders', {
        storeId,
        addressId: selectedAddr,
        paymentMethod: payMethod,
        cardToken,
        installments: isCard ? installments : undefined,
        payerCpf: isCard ? cardCpf : undefined,
        items: items.map(i => ({ productId: i.productId, variationId: i.variationId, quantity: i.quantity })),
      })

      clear()

      if (payMethod === 'PIX' && order.payment?.pixCode) {
        setPixOrder(order)
      } else {
        router.push(`/orders/${order.id}`)
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Não foi possível finalizar o pedido')
    } finally { setLoading(false) }
  }

  async function handleCheckPix() {
    if (!pixOrder) return
    setPolling(true)
    try {
      const { data } = await api.get(`/payments/orders/${pixOrder.id}/sync`)
      if (data?.status === 'PAID') router.push(`/orders/${pixOrder.id}`)
      else setError('Pagamento ainda não confirmado. Aguarde alguns instantes.')
    } catch {} finally { setPolling(false) }
  }

  function copyPix() {
    navigator.clipboard.writeText(pixOrder?.payment.pixCode ?? '')
    setPixCopied(true)
    setTimeout(() => setPixCopied(false), 2500)
  }

  // PIX screen
  if (pixOrder) {
    return (
      <>
        <Navbar />
        <div className={styles.pixPage}>
          <div className={styles.pixCard}>
            <div className={styles.pixIcon}>⚡</div>
            <h2 className={styles.pixTitle}>Pedido criado!</h2>
            <p className={styles.pixSub}>Escaneie o QR Code ou copie o código PIX para pagar</p>
            {pixOrder.payment.pixQrBase64 && (
              <Image src={`data:image/png;base64,${pixOrder.payment.pixQrBase64}`} alt="QR Code PIX" width={220} height={220} style={{ borderRadius: 12, margin: '16px auto' }} />
            )}
            <button className={styles.copyBtn} onClick={copyPix}>
              {pixCopied ? '✓ Copiado!' : '📋 Copiar código PIX'}
            </button>
            {error && <div className={styles.errorBox}>{error}</div>}
            <button className={styles.confirmBtn} onClick={handleCheckPix} disabled={polling}>
              {polling ? 'Verificando...' : 'Já paguei — verificar pagamento'}
            </button>
            <a href={`/orders/${pixOrder.id}`} className={styles.laterLink}>Ver pedido depois</a>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Navbar />
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
            {([
              { val: 'PIX' as PayMethod, label: 'PIX', desc: 'Instantâneo', emoji: '⚡', color: '#059669', bg: '#D1FAE5' },
              { val: 'CREDIT_CARD' as PayMethod, label: 'Crédito', desc: 'Online via MP', emoji: '💳', color: '#2563EB', bg: '#DBEAFE' },
              { val: 'DEBIT_CARD' as PayMethod, label: 'Débito', desc: 'Online via MP', emoji: '🏦', color: '#7C3AED', bg: '#EDE9FE' },
            ]).map(pm => (
              <button
                key={pm.val}
                className={`${styles.pmCard} ${payMethod === pm.val ? styles.pmCardActive : ''}`}
                onClick={() => setPayMethod(pm.val)}
              >
                <div className={styles.pmIcon} style={{ background: pm.bg }}>{pm.emoji}</div>
                <div className={styles.pmLabel}>{pm.label}</div>
                <div className={styles.pmDesc}>{pm.desc}</div>
              </button>
            ))}
          </div>

          {isCard && (
            <div className={styles.cardForm}>
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
            {items.map(i => (
              <div key={`${i.productId}-${i.variationId}`} className={styles.summaryItem}>
                <span className={styles.summaryQty}>{i.quantity}x</span>
                <span className={styles.summaryName}>{i.name}{i.variationName ? ` · ${i.variationName}` : ''}</span>
                <span>{fmtBRL(i.price * i.quantity)}</span>
              </div>
            ))}
            <div className={styles.summaryDivider} />
            <div className={styles.summaryRow}>
              <span>Subtotal</span><span>{fmtBRL(total())}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Entrega</span><span>calculado no pedido</span>
            </div>
          </div>
        </section>

        {error && <div className={styles.errorBox}>{error}</div>}

        <button className={styles.submitBtn} onClick={handleSubmit} disabled={loading}>
          {loading ? 'Processando...' : `Confirmar pedido`}
        </button>
      </div>
    </>
  )
}
