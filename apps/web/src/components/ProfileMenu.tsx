'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { User, Heart, MessagesSquare, ShoppingBag, LogOut, ChevronDown } from 'lucide-react'
import styles from './ProfileMenu.module.css'

const LINKS = [
  { href: '/profile', label: 'Meu perfil', Icon: User },
  { href: '/favorites', label: 'Favoritos', Icon: Heart },
  { href: '/mensagens', label: 'Mensagens', Icon: MessagesSquare },
  { href: '/orders', label: 'Meus pedidos', Icon: ShoppingBag },
]

/**
 * Avatar + nome na navbar, agora como gatilho de um menu — antes cada link
 * (favoritos, mensagens, pedidos, sair) era um ícone próprio na barra,
 * amontoados ao lado da busca. Só carrinho e notificações continuam soltos
 * (têm contador próprio, precisam estar visíveis sem abrir nada).
 */
export function ProfileMenu({ name, onLogout }: { name?: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button type="button" className={styles.trigger} onClick={() => setOpen((o) => !o)}>
        <span className={styles.avatarCircle}>{name?.[0]?.toUpperCase()}</span>
        <span className={styles.name}>{name?.split(' ')[0]}</span>
        <ChevronDown size={14} className={`${styles.chev} ${open ? styles.chevOpen : ''}`} />
      </button>

      {open && (
        <div className={styles.panel}>
          {LINKS.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className={styles.item} onClick={() => setOpen(false)}>
              <Icon size={16} /> {label}
            </Link>
          ))}
          <div className={styles.divider} />
          <button
            type="button" className={`${styles.item} ${styles.itemDanger}`}
            onClick={() => { setOpen(false); onLogout() }}
          >
            <LogOut size={16} /> Sair
          </button>
        </div>
      )}
    </div>
  )
}
