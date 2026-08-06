'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'
import { emojiFor } from '@/lib/categoryIcons'
import styles from './CategorySelect.module.css'

interface Option { id: string; name: string; icon?: string | null }

export function CategorySelect({
  options, value, onChange, placeholder = 'Sem categoria',
}: {
  options: Option[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = options.find(o => o.id === value)
  const filtered = options.filter(o => o.name.toLowerCase().includes(query.trim().toLowerCase()))

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      const t = setTimeout(() => searchRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  function select(id: string) {
    onChange(id)
    setOpen(false)
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button type="button" className={styles.trigger} onClick={() => setOpen(v => !v)}>
        <span className={styles.triggerContent}>
          <span className={styles.triggerEmoji}>{selected ? emojiFor(selected.icon) : '🏷️'}</span>
          <span className={selected ? styles.triggerText : styles.triggerPlaceholder}>
            {selected ? selected.name : placeholder}
          </span>
        </span>
        <ChevronDown size={16} className={`${styles.chev} ${open ? styles.chevOpen : ''}`} />
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.searchRow}>
            <Search size={14} className={styles.searchIcon} />
            <input
              ref={searchRef}
              className={styles.searchInput}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar categoria…"
            />
          </div>
          <div className={styles.list}>
            <button type="button" className={styles.option} onClick={() => select('')}>
              <span className={styles.optEmoji}>🏷️</span>
              <span>Sem categoria</span>
              {!value && <Check size={14} className={styles.optCheck} />}
            </button>
            {filtered.map(o => (
              <button type="button" key={o.id} className={styles.option} onClick={() => select(o.id)}>
                <span className={styles.optEmoji}>{emojiFor(o.icon)}</span>
                <span>{o.name}</span>
                {value === o.id && <Check size={14} className={styles.optCheck} />}
              </button>
            ))}
            {filtered.length === 0 && <div className={styles.empty}>Nenhuma categoria encontrada.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
