'use client'
import Link from 'next/link'
import styles from './ChatConversationList.module.css'

export interface ConversationItem {
  id: string
  name: string
  subtitle: string
  avatarUrl?: string | null
}

/**
 * Painel lateral de conversas — reaproveitado pela tela de chat do cliente e
 * do lojista. Não é uma caixa de entrada de verdade (não sabe quem tem
 * mensagem nova nem mostra prévia da última): cada linha é só um pedido da
 * lista que a própria página já busca (GET /orders ou /orders/store), servindo
 * de atalho pra trocar de conversa sem precisar voltar pro pedido primeiro.
 */
export function ChatConversationList({
  items, activeId, getHref, emptyLabel = 'Nenhuma conversa ainda.',
}: {
  items: ConversationItem[]
  activeId: string
  getHref: (id: string) => string
  emptyLabel?: string
}) {
  if (items.length === 0) {
    return <p className={styles.empty}>{emptyLabel}</p>
  }
  return (
    <nav className={styles.list}>
      {items.map((it) => {
        const active = it.id === activeId
        return (
          <Link key={it.id} href={getHref(it.id)} className={`${styles.row} ${active ? styles.rowActive : ''}`}>
            {it.avatarUrl ? (
              <span className={styles.avatar} style={{ backgroundImage: `url(${it.avatarUrl})` }} />
            ) : (
              <span className={styles.avatarFallback}>{it.name.charAt(0).toUpperCase()}</span>
            )}
            <span className={styles.rowBody}>
              <span className={styles.rowName}>{it.name}</span>
              <span className={styles.rowSub}>{it.subtitle}</span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
