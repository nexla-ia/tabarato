'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Navbar } from '@/components/Navbar'
import { api } from '@/lib/api'
import styles from './page.module.css'

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando confirmação', CONFIRMED: 'Confirmado', PREPARING: 'Preparando',
  READY: 'Pronto para retirada', PICKED_UP: 'Saiu para entrega',
  DELIVERED: 'Entregue', CANCELLED: 'Cancelado',
}
const STATUS_COLOR: Record<string, string> = {
  PENDING: '#D97706', CONFIRMED: '#2563EB', PREPARING: '#7C3AED',
  READY: '#0891B2', PICKED_UP: '#059669', DELIVERED: '#16A34A', CANCELLED: '#DC2626',
}
const STEPS = ['PENDING','CONFIRMED','PREPARING','READY','DELIVERED']

function fmtBRL(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}` }

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [pixCopied, setPixCopied] = useState(false)
  const [checkingPix, setCheckingPix] = useState(false)

  const isTerminal = order?.status === 'DELIVERED' || order?.status === 'CANCELLED'

  useEffect(() => {
    api.get(`/orders/${id}`).then(r => setOrder(r.data)).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!order || isTerminal) return
    const t = setInterval(() => {
      api.get(`/orders/${id}`).then(r => setOrder(r.data)).catch(() => {})
    }, 8000)
    return () => clearInterval(t)
  }, [id, order?.status, isTerminal])

  async function handleCheckPix() {
    setCheckingPix(true)
    try {
      const { data } = await api.get(`/payments/orders/${id}/sync`)
      if (data?.status === 'PAID') api.get(`/orders/${id}`).then(r => setOrder(r.data))
      else alert('Pagamento ainda não confirmado. Aguarde.')
    } catch {} finally { setCheckingPix(false) }
  }

  if (loading) return <><Navbar /><div className={styles.loading}>Carregando...</div></>

  if (!order) return <><Navbar /><div className={styles.loading}>Pedido não encontrado.</div></>

  const stepIdx = order.status === 'DELIVERED' ? 4 : STEPS.indexOf(order.status)
  const color = STATUS_COLOR[order.status] ?? '#888'

  return (
    <>
      <Navbar />
      <div className="container" style={{ padding: '32px 20px 60px', maxWidth: 680 }}>
        <Link href="/orders" className={styles.back}>← Meus pedidos</Link>
        <h1 className={styles.title}>Pedido #{order.id.slice(0,8).toUpperCase()}</h1>

        {/* Status badge */}
        <div className={styles.statusBadge} style={{ background: color + '18', color }}>
          {STATUS_LABEL[order.status] ?? order.status}
        </div>

        {/* Progress steps */}
        {!['CANCELLED'].includes(order.status) && (
          <div className={styles.progress}>
            {['Aguardando','Confirmado','Preparando','Pronto','Entregue'].map((label, i) => (
              <div key={i} className={styles.progressItem}>
                <div className={`${styles.progressDot} ${i <= stepIdx ? styles.progressDotActive : ''}`}
                  style={i <= stepIdx ? { background: color, borderColor: color } : {}}>
                  {i < stepIdx && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
                </div>
                {i < 4 && <div className={`${styles.progressLine} ${i < stepIdx ? styles.progressLineActive : ''}`} style={i < stepIdx ? { background: color } : {}} />}
              </div>
            ))}
          </div>
        )}

        {/* PIX payment */}
        {order.payment?.method === 'PIX' && order.payment?.status === 'PENDING' && order.payment?.pixCode && (
          <div className={styles.pixBox}>
            <h3 className={styles.pixTitle}>⚡ Aguardando pagamento PIX</h3>
            {order.payment.pixQrBase64 && (
              <Image src={`data:image/png;base64,${order.payment.pixQrBase64}`} alt="QR" width={180} height={180} style={{ borderRadius: 10, margin: '12px auto' }} />
            )}
            <button className={styles.copyBtn} onClick={() => { navigator.clipboard.writeText(order.payment.pixCode); setPixCopied(true); setTimeout(() => setPixCopied(false), 2500) }}>
              {pixCopied ? '✓ Copiado!' : '📋 Copiar código PIX'}
            </button>
            <button className={styles.checkPixBtn} onClick={handleCheckPix} disabled={checkingPix}>
              {checkingPix ? 'Verificando...' : 'Já paguei — verificar'}
            </button>
          </div>
        )}

        {/* Store + items */}
        <div className={styles.card}>
          <h2 className={styles.storeName}>{order.store?.name}</h2>
          {order.items?.map((item: any) => (
            <div key={item.id} className={styles.item}>
              <span className={styles.itemQty}>{item.quantity}x</span>
              <span className={styles.itemName}>{item.product?.name}{item.variation ? ` · ${item.variation.name}` : ''}</span>
              <span className={styles.itemPrice}>{fmtBRL(item.unitPrice * item.quantity)}</span>
            </div>
          ))}
          <div className={styles.divider} />
          <div className={styles.totalRow}>
            <span>Entrega</span><span>{fmtBRL(order.deliveryFee)}</span>
          </div>
          {order.discount > 0 && <div className={styles.totalRow}><span style={{ color: 'var(--green)' }}>Desconto</span><span style={{ color: 'var(--green)' }}>-{fmtBRL(order.discount)}</span></div>}
          <div className={styles.grandTotal}>
            <span>Total</span><span>{fmtBRL(order.total)}</span>
          </div>
        </div>

        {/* Delivery */}
        {order.delivery && (
          <div className={styles.card} style={{ marginTop: 14 }}>
            <h3 className={styles.sectionLabel}>Entregador</h3>
            {order.delivery.courier
              ? <p className={styles.courierName}>{order.delivery.courier.user?.name}</p>
              : <p className={styles.searching}>🔍 Buscando entregador...</p>
            }
            <p className={styles.deliveryStatus}>{order.delivery.status?.replace(/_/g, ' ')}</p>
          </div>
        )}

        {/* Delivery photo */}
        {order.delivery?.photoUrl && order.status === 'DELIVERED' && (
          <div className={styles.card} style={{ marginTop: 14 }}>
            <h3 className={styles.sectionLabel}>Foto de entrega</h3>
            <Image src={order.delivery.photoUrl} alt="Entrega" width={600} height={300} style={{ borderRadius: 10, objectFit: 'cover', width: '100%', height: 'auto' }} />
          </div>
        )}
      </div>
    </>
  )
}
