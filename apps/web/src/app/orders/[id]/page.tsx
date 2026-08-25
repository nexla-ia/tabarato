'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Navbar } from '@/components/Navbar'
import { OrderChat } from '@/components/OrderChat'
import { OrderReview } from '@/components/OrderReview'
import { CourierReview } from '@/components/CourierReview'
import { useAuth } from '@/hooks/useAuth'
import { useCartStore } from '@/stores/cart'
import { useCourierPosition } from '@/hooks/useCourierPosition'
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

function fmtBRL(v: number | string) { return `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}` }

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const addItem = useCartStore((s) => s.addItem)
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [pixCopied, setPixCopied] = useState(false)
  const [checkingPix, setCheckingPix] = useState(false)
  const [cancelling, setCancelling] = useState(false)

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

  // Rastreio ao vivo do entregador (enquanto a entrega está a caminho).
  const LIVE_DELIVERY = ['COURIER_ASSIGNED', 'COURIER_HEADING_TO_STORE', 'COURIER_AT_STORE', 'PICKED_UP', 'HEADING_TO_CLIENT']
  const trackingActive = !!order?.delivery && LIVE_DELIVERY.includes(order?.delivery?.status) && !isTerminal
  const courierPos = useCourierPosition(order?.id ?? null, trackingActive)

  async function handleCheckPix() {
    setCheckingPix(true)
    try {
      const { data } = await api.get(`/payments/orders/${id}/sync`)
      if (data?.status === 'PAID') api.get(`/orders/${id}`).then(r => setOrder(r.data))
      else alert('Pagamento ainda não confirmado. Aguarde.')
    } catch {} finally { setCheckingPix(false) }
  }

  async function handleCancel() {
    if (!confirm('Tem certeza que deseja cancelar este pedido?')) return
    setCancelling(true)
    try {
      await api.patch(`/orders/${id}/cancel`)
      const r = await api.get(`/orders/${id}`)
      setOrder(r.data)
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Não foi possível cancelar o pedido.')
    } finally { setCancelling(false) }
  }
  // Cliente só cancela antes de a loja começar a preparar (backend: PENDING/CONFIRMED).
  const canCancel = order && ['PENDING', 'CONFIRMED'].includes(order.status)

  // "Pedir de novo": readiciona ao carrinho com o PREÇO ATUAL (item.product é o
  // registro atual), pulando produtos inativos.
  function handleReorder() {
    const st = order?.store
    if (!st?.id) return
    let added = 0, skipped = 0
    for (const it of (order.items ?? [])) {
      const p = it.product
      if (!p || p.isActive === false) { skipped++; continue }
      const price = Number(it.variation?.price ?? p.basePrice ?? 0)
      addItem(st.id, st.name, {
        productId: p.id, variationId: it.variation?.id, name: p.name,
        price, quantity: it.quantity, imageUrl: p.imageUrl ?? undefined, variationName: it.variation?.name,
        promoBuyQty: p.promoBuyQty, promoPayQty: p.promoPayQty,
      }, user?.id)
      added++
    }
    if (added === 0) { alert('Nenhum item deste pedido está disponível no momento.'); return }
    alert(skipped > 0 ? `${added} item(ns) adicionados ao carrinho (${skipped} indisponível(is)).` : 'Itens adicionados ao carrinho!')
    router.push('/cart')
  }

  if (loading) return <><Navbar /><div className={styles.loading}>Carregando...</div></>

  if (!order) return <><Navbar /><div className={styles.loading}>Pedido não encontrado.</div></>

  // PICKED_UP não está em STEPS (é status legado entre READY e DELIVERED):
  // mostra o passo "Pronto" como ativo em vez de zerar o tracker.
  const stepIdx = order.status === 'DELIVERED'
    ? 4
    : order.status === 'PICKED_UP'
      ? STEPS.indexOf('READY')
      : STEPS.indexOf(order.status)
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

        {/* Progress tracker */}
        {order.status !== 'CANCELLED' && (
          <div className={styles.tracker}>
            {['Aguardando','Confirmado','Preparando','Pronto','Entregue'].map((label, i) => {
              const done = i < stepIdx
              const current = i === stepIdx
              return (
                <div key={i} className={`${styles.trackStep} ${i <= stepIdx ? styles.trackStepOn : ''}`}>
                  <span className={`${styles.trackDot} ${done ? styles.trackDotDone : ''} ${current ? styles.trackDotCurrent : ''}`}>
                    {done ? '✓' : i + 1}
                  </span>
                  <span className={`${styles.trackLabel} ${i <= stepIdx ? styles.trackLabelOn : ''}`}>{label}</span>
                </div>
              )
            })}
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

        {/* Pedir de novo (pedidos finalizados) */}
        {isTerminal && (
          <button
            onClick={handleReorder}
            style={{
              width: '100%', marginTop: 14, padding: '13px', borderRadius: 12,
              border: 'none', background: 'var(--primary, #FF6600)', color: '#fff',
              fontWeight: 800, fontSize: 15, cursor: 'pointer',
            }}
          >
            🔁 Pedir de novo
          </button>
        )}

        {/* Cancelar (só antes da loja começar a preparar) */}
        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            style={{
              width: '100%', marginTop: 14, padding: '13px', borderRadius: 12,
              border: '1.5px solid #DC2626', background: 'transparent', color: '#DC2626',
              fontWeight: 700, fontSize: 15, cursor: cancelling ? 'default' : 'pointer', opacity: cancelling ? 0.6 : 1,
            }}
          >
            {cancelling ? 'Cancelando…' : 'Cancelar pedido'}
          </button>
        )}

        {/* Delivery */}
        {order.delivery && (
          <div className={styles.card} style={{ marginTop: 14 }}>
            <h3 className={styles.sectionLabel}>Entregador</h3>
            {order.delivery.courier
              ? <p className={styles.courierName}>{order.delivery.courier.user?.name}</p>
              : <p className={styles.searching}>🔍 Buscando entregador...</p>
            }
            <p className={styles.deliveryStatus}>{order.delivery.status?.replace(/_/g, ' ')}</p>

            {/* Mapa ao vivo com a posição do entregador (enquanto a caminho) */}
            {trackingActive && courierPos && (
              <div style={{ marginTop: 10 }}>
                <iframe
                  title="Rastreio do entregador"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${courierPos.lng - 0.008}%2C${courierPos.lat - 0.006}%2C${courierPos.lng + 0.008}%2C${courierPos.lat + 0.006}&layer=mapnik&marker=${courierPos.lat}%2C${courierPos.lng}`}
                  style={{ width: '100%', height: 220, border: 0, borderRadius: 12 }}
                  loading="lazy"
                />
                <p className={styles.deliveryStatus} style={{ fontSize: 12, marginTop: 6 }}>📍 Posição do entregador ao vivo</p>
              </div>
            )}
            {trackingActive && !courierPos && (
              <p className={styles.deliveryStatus} style={{ fontSize: 12, marginTop: 6 }}>📍 Localizando o entregador…</p>
            )}

            {/* Código de entrega (anti-fraude): cliente informa ao entregador */}
            {order.deliveryCode
              && order.delivery.status !== 'SEARCHING_COURIER'
              && order.status !== 'DELIVERED'
              && order.status !== 'CANCELLED' && (
              <div className={styles.deliveryCode}>
                <span className={styles.deliveryCodeLabel}>🔒 Código de entrega</span>
                <span className={styles.deliveryCodeDigits}>{order.deliveryCode}</span>
                <span className={styles.deliveryCodeHint}>Informe este código ao entregador para confirmar a entrega.</span>
              </div>
            )}
          </div>
        )}

        {/* Delivery photo */}
        {order.delivery?.photoUrl && order.status === 'DELIVERED' && (
          <div className={styles.card} style={{ marginTop: 14 }}>
            <h3 className={styles.sectionLabel}>Foto de entrega</h3>
            <Image src={order.delivery.photoUrl} alt="Entrega" width={600} height={300} style={{ borderRadius: 10, objectFit: 'cover', width: '100%', height: 'auto' }} />
          </div>
        )}

        {/* Avaliação — só depois de entregue */}
        {order.status === 'DELIVERED' && (
          <div className={styles.card} style={{ marginTop: 14 }}>
            <h3 className={styles.sectionLabel}>Avalie sua compra</h3>
            <div style={{ marginTop: 10 }}>
              <OrderReview orderId={order.id} />
            </div>
            {order.delivery?.courier && (
              <div style={{ marginTop: 16, borderTop: '1px solid var(--border, #eee)', paddingTop: 16 }}>
                <CourierReview orderId={order.id} courierName={order.delivery.courier.user?.name} />
              </div>
            )}
          </div>
        )}

        {/* Chat com a loja */}
        {user && (
          <div className={styles.card} style={{ marginTop: 14 }}>
            <h3 className={styles.sectionLabel}>Fale com a loja</h3>
            <div style={{ marginTop: 10 }}>
              <OrderChat orderId={order.id} currentUserId={user.id} />
            </div>
          </div>
        )}
      </div>
    </>
  )
}
