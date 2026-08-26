'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { OrderChat } from '@/components/OrderChat'
import { Spinner } from '@/components/Spinner'
import styles from './page.module.css'

interface OrderHeader {
  id: string
  status: string
  user?: { name: string; phone?: string | null } | null
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando confirmação', CONFIRMED: 'Confirmado', PREPARING: 'Preparando',
  READY: 'Pronto para retirada', PICKED_UP: 'Saiu para entrega',
  DELIVERED: 'Entregue', CANCELLED: 'Cancelado',
}

// Rota vive sob /lojista/[id]/chat → já herda o shell (sidebar + guard de
// STORE_OWNER) do layout de /lojista, não precisa repetir aqui.
export default function LojistaOrderChatPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const [order, setOrder] = useState<OrderHeader | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/orders/${id}`).then(r => setOrder(r.data)).finally(() => setLoading(false))
  }, [id])

  if (loading || !user) return <div className={styles.loading}><Spinner /></div>
  if (!order) return <div className={styles.loading}>Pedido não encontrado.</div>

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => router.push('/lojista/pedidos')}>
        <ArrowLeft size={16} /> Pedidos
      </button>

      <div className={styles.header}>
        <div className={styles.avatar}>{(order.user?.name ?? '?').charAt(0).toUpperCase()}</div>
        <div className={styles.headerInfo}>
          <h1 className={styles.title}>{order.user?.name ?? 'Cliente'}</h1>
          <span className={styles.sub}>
            Pedido #{order.id.slice(-6).toUpperCase()} · {STATUS_LABEL[order.status] ?? order.status}
            {order.user?.phone ? ` · ${order.user.phone}` : ''}
          </span>
        </div>
      </div>

      <OrderChat orderId={order.id} currentUserId={user.id} fill />
    </div>
  )
}
