'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { LayoutDashboard, ReceiptText, Package, Ticket, Settings, LogOut, Lock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { Store } from '@/lib/types'
import styles from './layout.module.css'

const NAV = [
  { href: '/lojista',          label: 'Painel',         Icon: LayoutDashboard, exact: true },
  { href: '/lojista/pedidos',  label: 'Pedidos',        Icon: ReceiptText, lockable: true },
  { href: '/lojista/produtos', label: 'Produtos',       Icon: Package, lockable: true },
  { href: '/lojista/cupons',   label: 'Cupons',         Icon: Ticket, lockable: true },
  { href: '/lojista/config',   label: 'Configurações',  Icon: Settings },
]

// Só libera Pedidos/Produtos/Cupons com a loja aprovada — antes disso não tem
// pedido de verdade nem sentido em cadastrar produtos/cupons ainda.
const LOCKED_PATHS = ['/lojista/pedidos', '/lojista/produtos', '/lojista/cupons']

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

  useEffect(() => {
    if (!ready) return
    if (!user) { router.replace('/login'); return }
    if (user.role !== 'STORE_OWNER') { router.replace('/'); return }
  }, [ready, user, router])

  useEffect(() => {
    if (locked && LOCKED_PATHS.some((p) => pathname.startsWith(p))) router.replace('/lojista')
  }, [locked, pathname, router])

  if (!ready || !user || user.role !== 'STORE_OWNER') {
    return <div className={styles.loading}>Carregando…</div>
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
          <div>
            <div className={styles.brandName}>Tá Barato</div>
            <div className={styles.brandTag}>LOJISTA</div>
          </div>
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
