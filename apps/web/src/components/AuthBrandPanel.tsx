import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import styles from './AuthBrandPanel.module.css'

interface BrandItem { icon: React.ReactNode; text: string }

/** Trecho destacado (cor creme) dentro do título — pra quem passa um `title`
 *  customizado sem precisar conhecer a classe interna do painel. */
export function AuthBrandAccent({ children }: { children: React.ReactNode }) {
  return <span className={styles.titleAccent}>{children}</span>
}

/**
 * Painel de marca compartilhado por login, cadastro de cliente e cadastro de
 * loja. Logo e largura do painel são FIXOS — sempre os mesmos em qualquer
 * tela. Todo o resto (badge/título/subtítulo/lista) é opcional — sem passar
 * nada, o painel mostra só a logo (é o caso de login/cadastro de cliente).
 */
export function AuthBrandPanel({
  badge,
  title,
  subtitle,
  items,
  sticky = false,
}: {
  badge?: React.ReactNode
  title?: React.ReactNode
  subtitle?: string
  items?: BrandItem[]
  /** Cadastro de loja é um wizard longo — o painel acompanha o scroll (sticky)
   *  em vez de sumir no mobile, que é o padrão pras telas curtas de login/cadastro. */
  sticky?: boolean
}) {
  return (
    <div className={`${styles.panel} ${sticky ? styles.panelSticky : ''}`}>
      <div className={styles.glow} />
      <div className={styles.blob1} />
      <div className={styles.blob2} />

      <Link href="/" className={styles.back}><ArrowLeft size={16} /> Voltar ao início</Link>

      <div className={styles.content}>
        <div className={styles.logoWrap}>
          <Image src="/logo.png" alt="Tá Barato" width={216} height={216} className={styles.logo} style={{ objectFit: 'contain' }} priority />
        </div>
        {badge && <span className={styles.badge}>{badge}</span>}
        {title && <h1 className={styles.title}>{title}</h1>}
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}

        {items && items.length > 0 && (
          <div className={styles.list}>
            {items.map((it, i) => (
              <div key={i} className={styles.listItem}>
                <span className={styles.listIcon}>{it.icon}</span>
                {it.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
