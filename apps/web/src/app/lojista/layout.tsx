'use client'
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { LayoutDashboard, ReceiptText, Package, Ticket, Wallet, Star, BarChart3, Settings, LogOut, Lock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { Store, Order, isOrderLate } from '@/lib/types'
import { playNewOrderSound, playLateOrderAlert } from '@/lib/notifySound'
import { Spinner } from '@/components/Spinner'
import { NotificationBell } from '@/components/NotificationBell'
import styles from './layout.module.css'

interface MpStatus { enabled: boolean; connected: boolean }

const NAV = [
  { href: '/lojista',          label: 'Painel',         Icon: LayoutDashboard, exact: true },
  { href: '/lojista/pedidos',  label: 'Pedidos',        Icon: ReceiptText, lockable: true },
  { href: '/lojista/produtos', label: 'Produtos',       Icon: Package, lockable: true },
  { href: '/lojista/cupons',   label: 'Cupons',         Icon: Ticket, lockable: true },
  { href: '/lojista/carteira', label: 'Carteira',       Icon: Wallet, lockable: true },
  { href: '/lojista/avaliacoes', label: 'Avaliações',   Icon: Star, lockable: true },
  { href: '/lojista/analytics', label: 'Analytics',     Icon: BarChart3, lockable: true },
  { href: '/lojista/config',   label: 'Configurações',  Icon: Settings },
]

// Só libera Pedidos/Produtos/Cupons/Carteira/Avaliações/Analytics com a loja aprovada —
// antes disso não tem pedido, saldo nem avaliação de verdade ainda.
const LOCKED_PATHS = ['/lojista/pedidos', '/lojista/produtos', '/lojista/cupons', '/lojista/carteira', '/lojista/avaliacoes', '/lojista/analytics']

export default function LojistaLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, ready, logout } = useAuth()

  // Poll do status da loja — só enquanto ela não tá aprovada (pra banner e
  // bloqueio de Pedidos/Produtos atualizarem sozinhos). Loja aprovada = não
  // precisa mais ficar consultando, evita deixar o front pesado à toa.
  const storeQ = useQuery<Store>({
    queryKey: ['store-my'],
    queryFn: async () => (await api.get('/stores/my')).data,
    enabled: !!user && user.role === 'STORE_OWNER',
    refetchInterval: (query) => (query.state.data && query.state.data.status !== 'APPROVED' ? 15_000 : false),
  })
  const store = storeQ.data
  const locked = !!store && store.status !== 'APPROVED'

  // Contagem de pedidos aguardando confirmação — mostra no menu, mesma queryKey
  // usada em /lojista e /lojista/pedidos (compartilha cache, sem request extra).
  const ordersQ = useQuery<Order[]>({
    queryKey: ['store-orders'],
    queryFn: async () => (await api.get('/orders/store')).data,
    enabled: !!user && user.role === 'STORE_OWNER' && !locked,
    refetchInterval: 20_000,
  })
  const pendingCount = (ordersQ.data ?? []).filter((o) => o.status === 'PENDING').length

  // Toca um beep quando surge um pedido novo (id que ainda não tínhamos visto).
  // A 1ª leitura só grava a base, sem tocar — senão apitaria a cada login.
  const seenOrderIds = useRef<Set<string> | null>(null)
  useEffect(() => {
    const data = ordersQ.data
    if (!data) return
    const ids = new Set(data.map((o) => o.id))
    if (seenOrderIds.current) {
      const hasNew = data.some((o) => !seenOrderIds.current!.has(o.id))
      if (hasNew) playNewOrderSound()
    }
    seenOrderIds.current = ids
  }, [ordersQ.data])

  // Alerta (uma vez por pedido) quando ele cruza os 7min "Aguardando" sem confirmação.
  const lateOrders = (ordersQ.data ?? []).filter(isOrderLate)
  const hasLateOrders = lateOrders.length > 0
  const alertedLateIds = useRef<Set<string>>(new Set())
  useEffect(() => {
    const fresh = lateOrders.filter((o) => !alertedLateIds.current.has(o.id))
    if (fresh.length > 0) {
      playLateOrderAlert()
      fresh.forEach((o) => alertedLateIds.current.add(o.id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordersQ.data])

  // Mesmos critérios das abas de Configurações — "!" no menu avisa sem
  // precisar abrir a página pra descobrir o que falta.
  const mpQ = useQuery<MpStatus>({
    queryKey: ['mp-status'],
    queryFn: async () => (await api.get('/stores/mp/status')).data,
    enabled: !!user && user.role === 'STORE_OWNER' && !locked,
  })
  const configNeedsAttention = !!store && (
    !store.logoUrl || !store.phone ||
    !(store.openingHours ?? []).some((d) => d.open) ||
    !store.documentUrl ||
    (!!mpQ.data?.enabled && !mpQ.data?.connected)
  )

  useEffect(() => {
    if (!ready) return
    if (!user) { router.replace('/login'); return }
    if (user.role !== 'STORE_OWNER') { router.replace('/'); return }
  }, [ready, user, router])

  useEffect(() => {
    if (locked && LOCKED_PATHS.some((p) => pathname.startsWith(p))) router.replace('/lojista')
  }, [locked, pathname, router])

  if (!ready || !user || user.role !== 'STORE_OWNER') {
    return <div className={styles.loading}><Spinner /></div>
  }

  function handleLogout() {
    logout()
    router.push('/login')
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>TB</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.brandName}>Tá Barato</div>
            <div className={styles.brandTag}>LOJISTA</div>
          </div>
          <NotificationBell variant="dark" getOrderHref={() => '/lojista/pedidos'} />
        </div>

        <nav className={styles.nav}>
          {NAV.map(({ href, label, Icon, exact, lockable }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
            if (lockable && locked) {
              return (
                <span key={href} className={styles.navItemLocked} title="Disponível assim que sua loja for aprovada">
                  <Icon size={18} />
                  {label}
                  <Lock size={12} className={styles.navLockIcon} />
                </span>
              )
            }
            return (
              <Link key={href} href={href} className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}>
                <Icon size={18} />
                {label}
                {href === '/lojista/pedidos' && pendingCount > 0 && (
                  <span
                    className={`${styles.navBadge} ${hasLateOrders ? styles.navBadgeLate : ''}`}
                    title={hasLateOrders ? 'Tem pedido atrasado sem confirmação' : undefined}
                  >
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
                {href === '/lojista/config' && configNeedsAttention && (
                  <span className={styles.navWarn} title="Falta preencher algo nas configurações">!</span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className={styles.userBox}>
          <div className={styles.avatar}>{user.name?.[0]?.toUpperCase() ?? 'L'}</div>
          <div className={styles.userMeta}>
            <div className={styles.userName}>{user.name}</div>
            <div className={styles.userRole}>Lojista</div>
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout} title="Sair">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  )
}
