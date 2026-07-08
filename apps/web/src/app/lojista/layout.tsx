'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { LayoutDashboard, ReceiptText, Package, Settings, LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import styles from './layout.module.css'

const NAV = [
  { href: '/lojista',          label: 'Painel',         Icon: LayoutDashboard, exact: true },
  { href: '/lojista/pedidos',  label: 'Pedidos',        Icon: ReceiptText },
  { href: '/lojista/produtos', label: 'Produtos',       Icon: Package },
  { href: '/lojista/config',   label: 'Configurações',  Icon: Settings },
]

export default function LojistaLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, ready, logout } = useAuth()

  useEffect(() => {
    if (!ready) return
    if (!user) { router.replace('/login'); return }
    if (user.role !== 'STORE_OWNER') { router.replace('/'); return }
  }, [ready, user, router])

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
          {NAV.map(({ href, label, Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
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
