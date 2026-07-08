'use client'
import { useState, FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import styles from './SearchBar.module.css'

export function SearchBar() {
  const router = useRouter()
  const params = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')

  function submit(e: FormEvent) {
    e.preventDefault()
    const term = q.trim()
    router.push(term ? `/?q=${encodeURIComponent(term)}#lojas` : '/#lojas')
  }

  function clear() {
    setQ('')
    router.push('/#lojas')
  }

  return (
    <form className={styles.wrap} onSubmit={submit}>
      <Search size={20} className={styles.icon} />
      <input
        className={styles.input}
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Busque por loja ou produto…"
        aria-label="Buscar"
      />
      {q && (
        <button type="button" className={styles.clear} onClick={clear} aria-label="Limpar">
          <X size={16} />
        </button>
      )}
      <button type="submit" className={styles.btn}>Buscar</button>
    </form>
  )
}
