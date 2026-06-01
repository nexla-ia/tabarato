'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ShoppingBag, Bell, LogOut, User } from 'lucide-react'
import { clearToken } from '@/lib/api'
import styles from './Navbar.module.css'

export function Navbar({ user }: { user?: { name: string } | null }) {
  const router = useRouter()

  function handleLogout() {
    clearToken()
    router.push('/login')
  }

  return (
    <header className={styles.nav}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.logo}>
          <span className={styles.logoEmoji}>🛒</span>
          <span>Tá Barato</span>
        </Link>

        <div className={styles.actions}>
          {user ? (
            <>
              <Link href="/orders" className={styles.iconBtn} title="Meus pedidos">
                <ShoppingBag size={20} />
              </Link>
              <Link href="/notifications" className={styles.iconBtn} title="Notificações">
                <Bell size={20} />
              </Link>
              <Link href="/profile" className={styles.iconBtn} title="Perfil">
                <User size={20} />
              </Link>
              <button className={styles.iconBtn} onClick={handleLogout} title="Sair">
                <LogOut size={20} />
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className={styles.loginBtn}>Entrar</Link>
              <Link href="/register" className={styles.signupBtn}>Criar conta</Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
