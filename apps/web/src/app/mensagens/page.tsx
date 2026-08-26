'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessagesSquare } from 'lucide-react'
import Link from 'next/link'
import { Navbar } from '@/components/Navbar'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import styles from './page.module.css'

interface OrderListItem { id: string }

/**
 * Entrada do ícone "Mensagens" na navbar — não é uma tela própria, só decide
 * qual conversa abrir primeiro: manda pro chat do pedido mais recente
 * (/orders/:id/chat), que já tem o painel lateral com todas as outras.
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

  useEffect(() => {
    if (orders && orders.length > 0) router.replace(`/orders/${orders[0].id}/chat`)
  }, [orders, router])

  if (!ready || !user || orders === null || orders.length > 0) {
    return <><Navbar /><div className={styles.loading}>Carregando...</div></>
  }

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
