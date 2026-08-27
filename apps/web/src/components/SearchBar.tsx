'use client'
import { useState, useEffect, useRef, FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X, Clock } from 'lucide-react'
import styles from './SearchBar.module.css'

const RECENT_KEY = 'tb_recent_searches'
const MAX_RECENT = 8

function loadRecent(): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string') : []
  } catch { return [] }
}

function saveRecent(term: string): string[] {
  const next = [term, ...loadRecent().filter((s) => s.toLowerCase() !== term.toLowerCase())].slice(0, MAX_RECENT)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch {}
  return next
}

export function SearchBar() {
  const router = useRouter()
  const params = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [recent, setRecent] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const outerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setRecent(loadRecent()) }, [])

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (outerRef.current && !outerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  function runSearch(term: string) {
    const clean = term.trim()
    // Campo vazio + clicar em "Buscar" virava um no-op silencioso — se a
    // pessoa estava numa página de loja (não na home), parecia que a busca
    // "não fazia nada"/"só mostrava a própria loja", quando na real não tinha
    // pra onde navegar mesmo. Sem termo, leva pra listagem geral em vez de
    // ficar parado.
    if (!clean) { setOpen(false); router.push('/#lojas'); return }
    setRecent(saveRecent(clean))
    setOpen(false)
    router.push(`/?q=${encodeURIComponent(clean)}#lojas`)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    runSearch(q)
  }

  function clear() {
    setQ('')
    router.push('/#lojas')
  }

  const suggestions = q.trim()
    ? recent.filter((r) => r.toLowerCase() !== q.trim().toLowerCase() && r.toLowerCase().includes(q.trim().toLowerCase()))
    : recent

  return (
    <div className={styles.outer} ref={outerRef}>
      <form className={styles.wrap} onSubmit={submit}>
        <Search size={20} className={styles.icon} />
        <input
          className={styles.input}
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(q) } }}
          placeholder="Busque por loja ou produto…"
          aria-label="Buscar"
          autoComplete="off"
          enterKeyHint="search"
        />
        {q && (
          <button type="button" className={styles.clear} onClick={clear} aria-label="Limpar">
            <X size={16} />
          </button>
        )}
        <button type="submit" className={styles.btn}>Buscar</button>
      </form>

      {open && suggestions.length > 0 && (
        <ul className={styles.dropdown} role="listbox">
          {suggestions.map((term) => (
            <li key={term}>
              <button type="button" className={styles.recentItem} onClick={() => runSearch(term)}>
                <Clock size={15} className={styles.recentIcon} />
                {term}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
