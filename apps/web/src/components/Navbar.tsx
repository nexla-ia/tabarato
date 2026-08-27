'use client'
import { Suspense } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { ShoppingCart, MapPin, ChevronDown } from 'lucide-react'
import Image from 'next/image'
import { useAuth } from '@/hooks/useAuth'
import { useCartStore } from '@/stores/cart'
import { NotificationBell } from './NotificationBell'
import { ProfileMenu } from './ProfileMenu'
import { SearchBar } from './SearchBar'
import styles from './Navbar.module.css'

export function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const cartCount = useCartStore(s => s.itemCount())

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

        {/* Busca mora aqui (não mais no hero da home) — funciona de qualquer
            página, sempre manda pra /?q=...#lojas. */}
        <div className={styles.searchSlot}>
          <Suspense fallback={<div className={styles.searchFallback} />}>
            <SearchBar />
          </Suspense>
        </div>

        <div className={styles.actions}>
          <Link href="/cart" className={`${styles.iconBtn} ${pathname === '/cart' ? styles.iconBtnActive : ''}`} title="Carrinho">
            <ShoppingCart size={20} />
            {cartCount > 0 && <span className={styles.cartBadge}>{cartCount > 9 ? '9+' : cartCount}</span>}
          </Link>

          {user ? (
            <>
              <NotificationBell variant="light" />
              <ProfileMenu name={user.name} onLogout={handleLogout} />
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
