'use client'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { ShoppingBag, LogOut, ShoppingCart, MapPin, ChevronDown, Heart } from 'lucide-react'
import Image from 'next/image'
import { useAuth } from '@/hooks/useAuth'
import { useCartStore } from '@/stores/cart'
import { NotificationBell } from './NotificationBell'
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
        <div className={styles.left}>
          <Link href="/" className={styles.logo}>
            <Image src="/logo-wide.png" alt="Tá Barato" height={38} width={150} style={{ objectFit: 'contain', height: 38, width: 'auto' }} priority />
          </Link>
          <button className={styles.location}>
            <MapPin size={15} />
            <span className={styles.locationText}>Vilhena<span className={styles.locationState}>, RO</span></span>
            <ChevronDown size={14} className={styles.chev} />
          </button>
        </div>

        <div className={styles.actions}>
          <Link href="/cart" className={`${styles.iconBtn} ${pathname === '/cart' ? styles.iconBtnActive : ''}`} title="Carrinho">
            <ShoppingCart size={20} />
            {cartCount > 0 && <span className={styles.cartBadge}>{cartCount > 9 ? '9+' : cartCount}</span>}
          </Link>

          {user ? (
            <>
              <NotificationBell variant="light" />
              <Link href="/favorites" className={`${styles.iconBtn} ${pathname.startsWith('/favorites') ? styles.iconBtnActive : ''}`} title="Lojas favoritas">
                <Heart size={20} />
              </Link>
              <Link href="/orders" className={`${styles.iconBtn} ${pathname.startsWith('/orders') ? styles.iconBtnActive : ''}`} title="Meus pedidos">
                <ShoppingBag size={20} />
              </Link>
              <Link href="/profile" className={styles.profile} title="Perfil">
                <span className={styles.avatarCircle}>{user.name?.[0]?.toUpperCase()}</span>
                <span className={styles.profileName}>{user.name?.split(' ')[0]}</span>
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
