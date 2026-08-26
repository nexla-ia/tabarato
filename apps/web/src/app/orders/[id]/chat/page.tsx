'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { OrderChat } from '@/components/OrderChat'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import styles from './page.module.css'

interface OrderHeader {
  id: string
  status: string
  store?: { name: string; logoUrl?: string | null } | null
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando confirmação', CONFIRMED: 'Confirmado', PREPARING: 'Preparando',
  READY: 'Pronto para retirada', PICKED_UP: 'Saiu para entrega',
  DELIVERED: 'Entregue', CANCELLED: 'Cancelado',
}

export default function OrderChatPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, ready } = useAuth()
  const [order, setOrder] = useState<OrderHeader | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (ready && !user) router.push(`/login?redirect=/orders/${id}/chat`)
  }, [ready, user, id, router])

  useEffect(() => {
    api.get(`/orders/${id}`).then(r => setOrder(r.data)).finally(() => setLoading(false))
  }, [id])

  if (loading || !user) return <><Navbar /><div className={styles.loading}>Carregando...</div></>
  if (!order) return <><Navbar /><div className={styles.loading}>Pedido não encontrado.</div></>

  return (
    <>
      <Navbar />
      <div className="container" style={{ padding: '24px 20px 40px', maxWidth: 680 }}>
        <Link href={`/orders/${id}`} className={styles.back}><ArrowLeft size={16} /> Pedido #{id.slice(-6).toUpperCase()}</Link>

        <div className={styles.header}>
          {order.store?.logoUrl ? (
            <Image src={order.store.logoUrl} alt={order.store.name ?? ''} width={44} height={44} className={styles.storeLogo} />
          ) : (
            <div className={styles.storeLogoFallback}>{(order.store?.name ?? '?').charAt(0)}</div>
          )}
          <div className={styles.headerInfo}>
            <h1 className={styles.storeName}>{order.store?.name ?? 'Loja'}</h1>
            <span className={styles.orderStatus}>{STATUS_LABEL[order.status] ?? order.status}</span>
          </div>
        </div>

        <OrderChat orderId={order.id} currentUserId={user.id} fill />
      </div>
    </>
  )
}
