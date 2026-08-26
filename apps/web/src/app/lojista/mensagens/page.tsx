'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { MessagesSquare } from 'lucide-react'
import { api } from '@/lib/api'
import { Order } from '@/lib/types'
import { Spinner } from '@/components/Spinner'
import styles from './page.module.css'

/**
 * Entrada do item "Mensagens" no menu — não é uma tela própria, só decide
 * qual conversa abrir primeiro: manda pro chat do pedido mais recente
 * (/lojista/pedidos/:id/chat), que já tem o painel lateral com todas as
 * outras. Reaproveita a MESMA queryKey do layout e de /lojista/pedidos —
 * cache quente, sem request extra na maioria das vezes.
 */
export default function LojistaMensagensPage() {
  const router = useRouter()
  const ordersQ = useQuery<Order[]>({
    queryKey: ['store-orders'],
    queryFn: async () => (await api.get('/orders/store')).data,
  })

  useEffect(() => {
    if (ordersQ.data && ordersQ.data.length > 0) {
      router.replace(`/lojista/pedidos/${ordersQ.data[0].id}/chat`)
    }
  }, [ordersQ.data, router])

  if (ordersQ.isLoading || (ordersQ.data && ordersQ.data.length > 0)) {
    return <div className={styles.loading}><Spinner /></div>
  }

  return (
    <div className={styles.empty}>
      <MessagesSquare size={32} strokeWidth={1.5} />
      <p>Você ainda não tem pedidos — as conversas com clientes aparecem aqui assim que o primeiro chegar.</p>
    </div>
  )
}
