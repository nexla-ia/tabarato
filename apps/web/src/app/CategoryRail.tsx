import Link from 'next/link'
import { BASE } from '@/lib/api'
import { emojiFor } from '@/lib/categoryIcons'
import { ScrollRail } from './ScrollRail'
import styles from './CategoryRail.module.css'

interface Category { id: string; name: string; icon?: string | null }

async function getCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${BASE}/stores/categories`, { next: { revalidate: 300 } })
    if (!res.ok) return []
    return res.json()
  } catch { return [] }
}

export async function CategoryRail({ active }: { active?: string }) {
  const cats = await getCategories()
  if (!cats.length) return null

  return (
    <section className={styles.section}>
      <ScrollRail>
        <Link href="/#lojas" className={`${styles.chip} ${!active ? styles.chipActive : ''}`}>
          <span className={styles.emoji}>✨</span>
          <span>Todas</span>
        </Link>
        {cats.map(c => (
          <Link
            key={c.id}
            href={`/?cat=${c.id}#lojas`}
            className={`${styles.chip} ${active === c.id ? styles.chipActive : ''}`}
          >
            <span className={styles.emoji}>{emojiFor(c.icon)}</span>
            <span>{c.name}</span>
          </Link>
        ))}
      </ScrollRail>
    </section>
  )
}
