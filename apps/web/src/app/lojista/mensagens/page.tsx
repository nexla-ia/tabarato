'use client'
import { useQuery } from '@tanstack/react-query'
import { MessagesSquare } from 'lucide-react'
import { api } from '@/lib/api'
import { Order } from '@/lib/types'
import { timeAgo } from '@/lib/types'
import { ChatConversationList, ConversationItem } from '@/components/ChatConversationList'
import { Spinner } from '@/components/Spinner'
import styles from './page.module.css'

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando', CONFIRMED: 'Confirmado', PREPARING: 'Preparando',
  READY: 'Pronto', PICKED_UP: 'A caminho', DELIVERED: 'Entregue', CANCELLED: 'Cancelado',
}

/**
 * Entrada do item "Mensagens" no menu. Não abre nenhuma conversa sozinha —
 * só lista os pedidos (um por pedido, mesmo que várias vezes do mesmo
 * cliente; cada pedido tem sua própria conversa). O lojista escolhe, aí sim
 * a conversa abre em /lojista/pedidos/:id/chat.
 *
 * Reaproveita a MESMA queryKey do layout e de /lojista/pedidos — cache
 * quente, sem request extra na maioria das vezes.
 */
export default function LojistaMensagensPage() {
  const ordersQ = useQuery<Order[]>({
    queryKey: ['store-orders'],
    queryFn: async () => (await api.get('/orders/store')).data,
  })

  if (ordersQ.isLoading) return <div className={styles.loading}><Spinner /></div>

  const orders = ordersQ.data ?? []
  if (orders.length === 0) {
    return (
      <div className={styles.empty}>
        <MessagesSquare size={32} strokeWidth={1.5} />
        <p>Você ainda não tem pedidos — as conversas com clientes aparecem aqui assim que o primeiro chegar.</p>
      </div>
    )
  }

  const conversations: ConversationItem[] = orders.map((o) => ({
    id: o.id,
    name: o.user?.name ?? 'Cliente',
    subtitle: `${STATUS_LABEL[o.status] ?? o.status} · ${timeAgo(o.createdAt)}`,
  }))

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Mensagens</h1>

      <div className={styles.layout}>
        <aside className={styles.panel}>
          <ChatConversationList items={conversations} activeId="" getHref={(id) => `/lojista/pedidos/${id}/chat`} />
        </aside>
        <div className={styles.placeholder}>
          <MessagesSquare size={40} strokeWidth={1.5} />
          <p>Selecione um pedido ao lado para ver a conversa.</p>
        </div>
      </div>

      {/* Mobile: sem espaço pra placeholder vazio — a lista já é a tela inteira. */}
      <div className={styles.mobileList}>
        <ChatConversationList items={conversations} activeId="" getHref={(id) => `/lojista/pedidos/${id}/chat`} />
      </div>
    </div>
  )
}
