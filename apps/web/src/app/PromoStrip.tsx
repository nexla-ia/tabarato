import { Zap, Percent, QrCode } from 'lucide-react'
import styles from './PromoStrip.module.css'

const PROMOS = [
  { Icon: Zap, title: 'Entrega no mesmo dia', sub: 'Do comércio local direto na sua casa', cls: 'a' },
  { Icon: QrCode, title: 'Pague com PIX', sub: 'Confirmação na hora, sem complicação', cls: 'b' },
  { Icon: Percent, title: 'Cupons e fidelidade', sub: 'Junte pontos e economize em cada pedido', cls: 'c' },
]

export function PromoStrip() {
  return (
    <section className={styles.grid}>
      {PROMOS.map(({ Icon, title, sub, cls }) => (
        <div key={title} className={`${styles.card} ${styles[cls]}`}>
          <div className={styles.iconWrap}><Icon size={22} /></div>
          <div>
            <div className={styles.title}>{title}</div>
            <div className={styles.sub}>{sub}</div>
          </div>
          <div className={styles.blob} />
        </div>
      ))}
    </section>
  )
}
