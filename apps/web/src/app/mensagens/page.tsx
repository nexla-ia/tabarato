'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessagesSquare } from 'lucide-react'
import Link from 'next/link'
import { Navbar } from '@/components/Navbar'
import { ChatConversationList, ConversationItem } from '@/components/ChatConversationList'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { timeAgo } from '@/lib/types'
import styles from './page.module.css'

interface OrderListItem {
  id: string; status: string; createdAt: string
  store?: { name: string; logoUrl?: string | null } | null
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando', CONFIRMED: 'Confirmado', PREPARING: 'Preparando',
  READY: 'Pronto', PICKED_UP: 'A caminho', DELIVERED: 'Entregue', CANCELLED: 'Cancelado',
}

/**
 * Entrada do ícone "Mensagens" na navbar. Não abre nenhuma conversa sozinha —
 * só lista os pedidos (um por pedido, mesmo que várias vezes na mesma loja;
 * cada pedido tem sua própria conversa). O cliente escolhe, aí sim a conversa
 * abre em /orders/:id/chat.
 */
export default function MensagensPage() {
  const router = useRouter()
  const { user, ready } = useAuth()
  const [orders, setOrders] = useState<OrderListItem[] | null>(null)

  useEffect(() => {
    if (!ready) return
    if (!user) { router.push('/login?redirect=/mensagens'); return }
    api.get<OrderListItem[]>('/orders').then(r => setOrders(r.data)).catch(() => setOrders([]))
  }, [ready, user, router])

  if (!ready || !user || orders === null) {
    return <><Navbar /><div className={styles.loading}>Carregando...</div></>
  }

  if (orders.length === 0) {
    return (
      <>
        <Navbar />
        <div className={styles.empty}>
          <MessagesSquare size={32} strokeWidth={1.5} />
          <p>Você ainda não fez nenhum pedido — a conversa com a loja aparece aqui assim que o primeiro chegar.</p>
          <Link href="/" className={styles.shopBtn}>Ver lojas</Link>
        </div>
      </>
    )
  }

  const conversations: ConversationItem[] = orders.map((o) => ({
    id: o.id,
    name: o.store?.name ?? 'Loja',
    subtitle: `${STATUS_LABEL[o.status] ?? o.status} · ${timeAgo(o.createdAt)}`,
    avatarUrl: o.store?.logoUrl,
  }))

  return (
    <>
      <Navbar />
      <div className="container" style={{ padding: '24px 20px 40px', maxWidth: 920 }}>
        <h1 className={styles.title}>Mensagens</h1>
        <div className={styles.layout}>
          <aside className={styles.panel}>
            <ChatConversationList items={conversations} activeId="" getHref={(id) => `/orders/${id}/chat`} />
          </aside>
          <div className={styles.placeholder}>
            <MessagesSquare size={40} strokeWidth={1.5} />
            <p>Selecione um pedido ao lado para ver a conversa.</p>
          </div>
        </div>

        {/* Mobile: sem coluna de placeholder, a lista já é o conteúdo principal. */}
        <div className={styles.mobileList}>
          <ChatConversationList items={conversations} activeId="" getHref={(id) => `/orders/${id}/chat`} />
        </div>
      </div>
    </>
  )
}
