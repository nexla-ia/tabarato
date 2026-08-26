'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, MessagesSquare, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { timeAgo } from '@/lib/types'
import { OrderChat } from '@/components/OrderChat'
import { ChatConversationList, ConversationItem } from '@/components/ChatConversationList'
import { Spinner } from '@/components/Spinner'
import styles from './page.module.css'

interface OrderHeader {
  id: string
  status: string
  user?: { name: string; phone?: string | null } | null
}

interface OrderListItem {
  id: string; status: string; createdAt: string
  user?: { name: string } | null
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando confirmação', CONFIRMED: 'Confirmado', PREPARING: 'Preparando',
  READY: 'Pronto para retirada', PICKED_UP: 'Saiu para entrega',
  DELIVERED: 'Entregue', CANCELLED: 'Cancelado',
}

// Rota vive sob /lojista/pedidos/[id]/chat → já herda o shell (sidebar + guard
// de STORE_OWNER) do layout de /lojista, não precisa repetir aqui.
export default function LojistaOrderChatPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const [order, setOrder] = useState<OrderHeader | null>(null)
  const [orderList, setOrderList] = useState<OrderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    api.get(`/orders/${id}`).then(r => setOrder(r.data)).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    api.get<OrderListItem[]>('/orders/store').then(r => setOrderList(r.data)).catch(() => {})
  }, [])

  if (loading || !user) return <div className={styles.loading}><Spinner /></div>
  if (!order) return <div className={styles.loading}>Pedido não encontrado.</div>

  const conversations: ConversationItem[] = orderList.map((o) => ({
    id: o.id,
    name: o.user?.name ?? 'Cliente',
    subtitle: `${STATUS_LABEL[o.status] ?? o.status} · ${timeAgo(o.createdAt)}`,
  }))

  const list = (
    <ChatConversationList
      items={conversations}
      activeId={order.id}
      getHref={(oid) => `/lojista/pedidos/${oid}/chat`}
      emptyLabel="Nenhum pedido ainda."
    />
  )

  return (
    <>
      <div className={styles.page}>
        <div className={styles.topRow}>
          <button className={styles.back} onClick={() => router.push('/lojista/pedidos')}>
            <ArrowLeft size={16} /> Pedidos
          </button>
          <button type="button" className={styles.convBtn} onClick={() => setDrawerOpen(true)}>
            <MessagesSquare size={15} /> Conversas
          </button>
        </div>

        <div className={styles.layout}>
          <aside className={styles.panel}>{list}</aside>

          <div className={styles.main}>
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
        </div>
      </div>

      {drawerOpen && (
        <div className={styles.drawerOverlay} onClick={() => setDrawerOpen(false)}>
          <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHead}>
              <span>Conversas</span>
              <button type="button" onClick={() => setDrawerOpen(false)}><X size={18} /></button>
            </div>
            {list}
          </div>
        </div>
      )}
    </>
  )
}
