'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { MessagesSquare, ArrowLeft } from 'lucide-react'
import { api } from '@/lib/api'
import { Order, timeAgo } from '@/lib/types'
import { useAuth } from '@/hooks/useAuth'
import { OrderChat } from '@/components/OrderChat'
import { ChatConversationList, ConversationItem } from '@/components/ChatConversationList'
import { Spinner } from '@/components/Spinner'
import styles from './page.module.css'

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando', CONFIRMED: 'Confirmado', PREPARING: 'Preparando',
  READY: 'Pronto', PICKED_UP: 'A caminho', DELIVERED: 'Entregue', CANCELLED: 'Cancelado',
}

/** Pedido entregue ou cancelado = conversa só-leitura (ver OrderChat). */
function closedReasonOf(status: string): 'DELIVERED' | 'CANCELLED' | undefined {
  return status === 'DELIVERED' || status === 'CANCELLED' ? status : undefined
}

function ChatHeader({ order }: { order: Order }) {
  return (
    <div className={styles.header}>
      <div className={styles.avatar}>{(order.user?.name ?? '?').charAt(0).toUpperCase()}</div>
      <div className={styles.headerInfo}>
        <h2 className={styles.headerTitle}>{order.user?.name ?? 'Cliente'}</h2>
        <span className={styles.headerSub}>
          Pedido #{order.id.slice(-6).toUpperCase()} · {STATUS_LABEL[order.status] ?? order.status}
          {order.user?.phone ? ` · ${order.user.phone}` : ''}
        </span>
      </div>
    </div>
  )
}

export default function LojistaMensagensPage() {
  return (
    <Suspense fallback={null}>
      <LojistaMensagensContent />
    </Suspense>
  )
}

/**
 * Tela única de mensagens do lojista: lista de pedidos + a conversa aberta,
 * tudo dentro desta mesma rota — clicar num pedido troca o painel da direita,
 * não navega pra lugar nenhum (era esse o bug: ia parar em "Pedidos").
 *
 * Reaproveita a MESMA queryKey do layout e de /lojista/pedidos — cache
 * quente, sem request extra na maioria das vezes.
 *
 * ?pedido=ID pré-seleciona uma conversa — usado pelo ícone de chat no card
 * do pedido em /lojista/pedidos, que já sabe qual abrir.
 */
function LojistaMensagensContent() {
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const ordersQ = useQuery<Order[]>({
    queryKey: ['store-orders'],
    queryFn: async () => (await api.get('/orders/store')).data,
  })

  useEffect(() => {
    const pedido = searchParams.get('pedido')
    if (pedido) setSelectedId(pedido)
  }, [searchParams])

  if (ordersQ.isLoading || !user) return <div className={styles.loading}><Spinner /></div>

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
  const selected = orders.find((o) => o.id === selectedId) ?? null

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Mensagens</h1>

      {/* Desktop/tablet: lista + conversa lado a lado. */}
      <div className={styles.layout}>
        <aside className={styles.panel}>
          <ChatConversationList items={conversations} activeId={selectedId ?? ''} onSelect={setSelectedId} />
        </aside>
        <div className={styles.main}>
          {selected ? (
            <>
              <ChatHeader order={selected} />
              <OrderChat orderId={selected.id} currentUserId={user.id} fill closedReason={closedReasonOf(selected.status)} />
            </>
          ) : (
            <div className={styles.placeholder}>
              <MessagesSquare size={40} strokeWidth={1.5} />
              <p>Selecione um pedido ao lado para ver a conversa.</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: lista OU chat cheio, nunca os dois juntos. */}
      <div className={styles.mobileArea}>
        {selected ? (
          <div>
            <button type="button" className={styles.mobileBack} onClick={() => setSelectedId(null)}>
              <ArrowLeft size={16} /> Conversas
            </button>
            <ChatHeader order={selected} />
            <OrderChat orderId={selected.id} currentUserId={user.id} fill closedReason={closedReasonOf(selected.status)} />
          </div>
        ) : (
          <ChatConversationList items={conversations} activeId="" onSelect={setSelectedId} />
        )}
      </div>
    </div>
  )
}
