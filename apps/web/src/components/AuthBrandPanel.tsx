import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Clock, CreditCard, ShieldCheck } from 'lucide-react'
import styles from './AuthBrandPanel.module.css'

interface BrandItem { icon: React.ReactNode; text: string }

/** Trecho destacado (cor creme) dentro do título — pra quem passa um `title`
 *  customizado sem precisar conhecer a classe interna do painel. */
export function AuthBrandAccent({ children }: { children: React.ReactNode }) {
  return <span className={styles.titleAccent}>{children}</span>
}

const DEFAULT_ITEMS: BrandItem[] = [
  { icon: <Clock size={14} />, text: 'Entrega rápida, direto do comércio local' },
  { icon: <CreditCard size={14} />, text: 'Pague com PIX ou cartão, sem complicação' },
  { icon: <ShieldCheck size={14} />, text: 'Acompanhe a entrega em tempo real' },
]

/**
 * Painel de marca compartilhado por login, cadastro de cliente e cadastro de
 * loja. Logo e largura do painel são FIXOS — sempre os mesmos em qualquer
 * tela — só o texto (badge/título/subtítulo/lista) muda de acordo com quem
 * está do outro lado do formulário.
 */
export function AuthBrandPanel({
  badge = '🛵 Entrega na sua casa · Vilhena-RO',
  title = <>O comércio local<br />na palma da<span className={styles.titleAccent}> sua mão</span></>,
  subtitle = 'Peça de restaurantes, lanchonetes e lojas da cidade e receba rapidinho em casa.',
  items = DEFAULT_ITEMS,
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
        <span className={styles.badge}>{badge}</span>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>

        <div className={styles.list}>
          {items.map((it, i) => (
            <div key={i} className={styles.listItem}>
              <span className={styles.listIcon}>{it.icon}</span>
              {it.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
