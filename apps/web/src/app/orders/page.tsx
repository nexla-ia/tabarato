'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Navbar } from '@/components/Navbar'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import styles from './page.module.css'

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando', CONFIRMED: 'Confirmado', PREPARING: 'Preparando',
  READY: 'Pronto', PICKED_UP: 'A caminho', DELIVERED: 'Entregue', CANCELLED: 'Cancelado',
}
const STATUS_COLOR: Record<string, string> = {
  PENDING: '#D97706', CONFIRMED: '#2563EB', PREPARING: '#7C3AED',
  READY: '#0891B2', PICKED_UP: '#059669', DELIVERED: '#16A34A', CANCELLED: '#DC2626',
}

function fmtBRL(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}` }
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
}

interface Order {
  id: string; status: string; total: number; createdAt: string
  store: { name: string; logoUrl?: string }
  items: { quantity: number; product: { name: string } }[]
}

export default function OrdersPage() {
  const { user, ready } = useAuth()
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ready) return
    if (!user) { router.push('/login'); return }
    api.get<Order[]>('/orders/me').then(r => setOrders(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [user, ready])

  return (
    <>
      <Navbar />
      <div className="container" style={{ padding: '32px 20px 60px', maxWidth: 700 }}>
        <h1 className={styles.title}>Meus pedidos</h1>
        {loading ? (
          <div className={styles.loading}>Carregando...</div>
        ) : orders.length === 0 ? (
          <div className={styles.empty}>
            <p>Você ainda não fez nenhum pedido.</p>
            <Link href="/" className={styles.shopBtn}>Ver lojas</Link>
          </div>
        ) : (
          <div className={styles.list}>
            {orders.map(o => (
              <Link key={o.id} href={`/orders/${o.id}`} className={styles.card}>
                <div className={styles.cardTop}>
                  <div className={styles.storeName}>{o.store.name}</div>
                  <span className={styles.badge} style={{ background: STATUS_COLOR[o.status] + '18', color: STATUS_COLOR[o.status] }}>
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </div>
                <div className={styles.cardItems}>
                  {o.items.slice(0, 2).map((i, idx) => (
                    <span key={idx}>{i.quantity}x {i.product.name}</span>
                  ))}
                  {o.items.length > 2 && <span>+{o.items.length - 2} mais</span>}
                </div>
                <div className={styles.cardBottom}>
                  <span className={styles.total}>{fmtBRL(o.total)}</span>
                  <span className={styles.date}>{fmtDate(o.createdAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
