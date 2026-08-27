'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { MessagesSquare, ArrowLeft } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { OrderChat } from '@/components/OrderChat'
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
  PENDING: 'Aguardando pagamento', CONFIRMED: 'Confirmado', PREPARING: 'Preparando',
  READY: 'Pronto', PICKED_UP: 'A caminho', DELIVERED: 'Entregue', CANCELLED: 'Cancelado',
}

/** Pedido entregue ou cancelado = conversa só-leitura (ver OrderChat). */
function closedReasonOf(status: string): 'DELIVERED' | 'CANCELLED' | undefined {
  return status === 'DELIVERED' || status === 'CANCELLED' ? status : undefined
}

function ChatHeader({ order }: { order: OrderListItem }) {
  return (
    <div className={styles.header}>
      {order.store?.logoUrl ? (
        <Image src={order.store.logoUrl} alt={order.store.name ?? ''} width={44} height={44} className={styles.storeLogo} />
      ) : (
        <div className={styles.storeLogoFallback}>{(order.store?.name ?? '?').charAt(0)}</div>
      )}
      <div className={styles.headerInfo}>
        <h2 className={styles.headerTitle}>Pedido #{order.id.slice(-6).toUpperCase()}</h2>
        <span className={styles.headerSub}>{order.store?.name ?? 'Loja'} · {STATUS_LABEL[order.status] ?? order.status}</span>
      </div>
    </div>
  )
}

export default function MensagensPage() {
  return (
    <Suspense fallback={null}>
      <MensagensContent />
    </Suspense>
  )
}

/**
 * Tela única de mensagens do cliente: lista de pedidos + a conversa aberta,
 * tudo dentro desta mesma rota — clicar num pedido troca o painel da direita,
 * não navega pra lugar nenhum (era esse o bug: ia parar em "Pedidos").
 *
 * Cada linha mostra o PEDIDO como identificador principal (não a loja) —
 * um cliente com duas compras na mesma loja precisa distinguir qual é qual
 * antes de abrir.
 *
 * ?pedido=ID pré-seleciona uma conversa — usado por quem chega de fora (ex.:
 * "Fale com a loja" na página do pedido) já sabendo qual abrir.
 */
function MensagensContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, ready } = useAuth()
  const [orders, setOrders] = useState<OrderListItem[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    if (!user) { router.push('/login?redirect=/mensagens'); return }
    api.get<OrderListItem[]>('/orders').then(r => setOrders(r.data)).catch(() => setOrders([]))
  }, [ready, user, router])

  useEffect(() => {
    const pedido = searchParams.get('pedido')
    if (pedido) setSelectedId(pedido)
  }, [searchParams])

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
    name: `Pedido #${o.id.slice(-6).toUpperCase()}`,
    subtitle: `${o.store?.name ?? 'Loja'} · ${STATUS_LABEL[o.status] ?? o.status} · ${timeAgo(o.createdAt)}`,
    avatarUrl: o.store?.logoUrl,
  }))
  const selected = orders.find((o) => o.id === selectedId) ?? null

  return (
    <>
      <Navbar />
      <div className="container" style={{ padding: '24px 20px 40px', maxWidth: 920 }}>
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
    </>
  )
}
