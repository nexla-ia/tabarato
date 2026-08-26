'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Check } from 'lucide-react'
import { api } from '@/lib/api'
import styles from './NotificationBell.module.css'

interface Notification {
  id: string
  type: string
  title: string
  body?: string | null
  data?: { orderId?: string } | null
  isRead: boolean
  createdAt: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function NotificationBell({
  variant = 'light', align = 'right',
  getOrderHref = (orderId: string) => `/orders/${orderId}`,
}: {
  /** 'light' = navbar do cliente (fundo claro); 'dark' = sidebar escura do lojista */
  variant?: 'light' | 'dark'
  /** Borda do sino em que o painel se ancora. 'right' serve pra sino no canto
   *  direito de uma barra larga; 'left' pra sino dentro de container estreito
   *  (sidebar do lojista tem 232px — ancorar à direita joga o painel de 340px
   *  pra fora da viewport e corta o texto). */
  align?: 'left' | 'right'
  /** Pra onde uma notificação com data.orderId leva ao clicar. Cliente tem página
   *  por pedido (/orders/:id); lojista não, então manda pra lista (/lojista/pedidos). */
  getOrderHref?: (orderId: string) => string
}) {
  const router = useRouter()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const countQ = useQuery<{ count: number }>({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => (await api.get('/notifications/unread-count')).data,
    refetchInterval: 30_000,
  })
  const listQ = useQuery<Notification[]>({
    queryKey: ['notifications-list'],
    queryFn: async () => (await api.get('/notifications')).data,
    enabled: open,
  })

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  async function markAllRead() {
    await api.patch('/notifications/read-all')
    qc.setQueryData<{ count: number }>(['notifications-unread-count'], { count: 0 })
    qc.setQueryData<Notification[]>(['notifications-list'], (old) => old?.map((n) => ({ ...n, isRead: true })))
  }

  async function handleClick(n: Notification) {
    if (!n.isRead) {
      api.patch(`/notifications/${n.id}/read`).catch(() => {})
      qc.setQueryData<{ count: number }>(['notifications-unread-count'], (old) => ({ count: Math.max(0, (old?.count ?? 1) - 1) }))
      qc.setQueryData<Notification[]>(['notifications-list'], (old) => old?.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)))
    }
    setOpen(false)
    if (n.data?.orderId) router.push(getOrderHref(n.data.orderId))
  }

  const count = countQ.data?.count ?? 0
  const items = listQ.data ?? []

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.bellBtn} ${variant === 'dark' ? styles.bellBtnDark : styles.bellBtnLight}`}
        onClick={() => setOpen((o) => !o)}
        title="Notificações"
      >
        <Bell size={variant === 'dark' ? 18 : 20} />
        {count > 0 && <span className={styles.badge}>{count > 9 ? '9+' : count}</span>}
      </button>

      {open && (
        <div className={`${styles.panel} ${align === 'left' ? styles.panelLeft : ''}`}>
          <div className={styles.panelHead}>
            <span>Notificações</span>
            {count > 0 && (
              <button type="button" className={styles.markAllBtn} onClick={markAllRead}>
                <Check size={12} /> Marcar todas como lidas
              </button>
            )}
          </div>
          <div className={styles.panelList}>
            {listQ.isLoading ? (
              <p className={styles.empty}>Carregando…</p>
            ) : items.length === 0 ? (
              <p className={styles.empty}>Nenhuma notificação ainda.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`${styles.item} ${!n.isRead ? styles.itemUnread : ''}`}
                  onClick={() => handleClick(n)}
                >
                  {!n.isRead && <span className={styles.dot} />}
                  <div className={styles.itemBody}>
                    <span className={styles.itemTitle}>{n.title}</span>
                    {n.body && <span className={styles.itemText}>{n.body}</span>}
                    <span className={styles.itemTime}>{timeAgo(n.createdAt)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
