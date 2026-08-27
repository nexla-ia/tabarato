import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Clock, CreditCard, ShieldCheck } from 'lucide-react'
import styles from '@/app/login/page.module.css'

/**
 * Painel de marca do login/cadastro — mesma paleta e copy do hero da home
 * (page.module.css: .hero/.heroBadge/.heroTitle), só que vertical e mais
 * enxuto. Some abaixo de 900px (ver media query em page.module.css); o card
 * do formulário cobre esse caso com seu próprio back-link/logo.
 */
export function AuthBrandPanel() {
  return (
    <div className={styles.brandPanel}>
      <div className={styles.brandGlow} />
      <div className={styles.brandBlob1} />
      <div className={styles.brandBlob2} />

      <Link href="/" className={styles.brandBack}><ArrowLeft size={16} /> Voltar ao início</Link>

      <div className={styles.brandContent}>
        <Image src="/logo.png" alt="Tá Barato" width={72} height={72} className={styles.brandLogo} style={{ objectFit: 'contain' }} />
        <span className={styles.brandBadge}>🛵 Entrega na sua casa · Vilhena-RO</span>
        <h1 className={styles.brandTitle}>
          O comércio local<br />na palma da<span className={styles.brandTitleAccent}> sua mão</span>
        </h1>
        <p className={styles.brandSub}>
          Peça de restaurantes, lanchonetes e lojas da cidade e receba rapidinho em casa.
        </p>

        <div className={styles.brandList}>
          <div className={styles.brandListItem}>
            <span className={styles.brandListIcon}><Clock size={14} /></span>
            Entrega rápida, direto do comércio local
          </div>
          <div className={styles.brandListItem}>
            <span className={styles.brandListIcon}><CreditCard size={14} /></span>
            Pague com PIX ou cartão, sem complicação
          </div>
          <div className={styles.brandListItem}>
            <span className={styles.brandListIcon}><ShieldCheck size={14} /></span>
            Acompanhe a entrega em tempo real
          </div>
        </div>
      </div>
    </div>
  )
}
