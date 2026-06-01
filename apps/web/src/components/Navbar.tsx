'use client'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { ShoppingBag, LogOut, ShoppingCart } from 'lucide-react'
import Image from 'next/image'
import { useAuth } from '@/hooks/useAuth'
import { useCartStore } from '@/stores/cart'
import styles from './Navbar.module.css'

export function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const cartCount = useCartStore(s => s.items.reduce((a, i) => a + i.quantity, 0))

  function handleLogout() {
    logout()
    router.push('/')
  }

  return (
    <header className={styles.nav}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.logo}>
          <Image src="/logo-wide.png" alt="Tá Barato" height={40} width={160} style={{ objectFit: 'contain', height: 40, width: 'auto' }} priority />
        </Link>

        <div className={styles.actions}>
          {/* Cart */}
          <Link href="/cart" className={`${styles.iconBtn} ${pathname === '/cart' ? styles.iconBtnActive : ''}`} title="Carrinho">
            <div style={{ position: 'relative' }}>
              <ShoppingCart size={20} />
              {cartCount > 0 && (
                <span className={styles.cartBadge}>{cartCount > 9 ? '9+' : cartCount}</span>
              )}
            </div>
          </Link>

          {user ? (
            <>
              <Link href="/orders" className={`${styles.iconBtn} ${pathname.startsWith('/orders') ? styles.iconBtnActive : ''}`} title="Meus pedidos">
                <ShoppingBag size={20} />
              </Link>
              <Link href="/profile" className={`${styles.iconBtn} ${pathname === '/profile' ? styles.iconBtnActive : ''}`} title="Perfil">
                <div className={styles.avatarCircle}>{user.name?.[0]?.toUpperCase()}</div>
              </Link>
              <button className={styles.iconBtn} onClick={handleLogout} title="Sair">
                <LogOut size={18} />
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
