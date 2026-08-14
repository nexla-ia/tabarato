import { Loader2 } from 'lucide-react'
import styles from './Spinner.module.css'

export function Spinner({ label = 'Carregando…', size = 26 }: { label?: string | null; size?: number }) {
  return (
    <div className={styles.wrap}>
      <Loader2 size={size} className={styles.icon} />
      {label && <span>{label}</span>}
    </div>
  )
}
