'use client'
import styles from './ChatConversationList.module.css'

export interface ConversationItem {
  id: string
  name: string
  subtitle: string
  avatarUrl?: string | null
}

/**
 * Lista de conversas da tela de Mensagens (cliente e lojista). Clicar troca
 * qual conversa aparece ao lado — SEM navegar pra outra rota (chat vive só
 * dentro de /mensagens e /lojista/mensagens; não existe mais uma página por
 * pedido pra evitar essa lista mandar o usuário pra "Pedidos" sem querer).
 *
 * Não é uma caixa de entrada de verdade (não sabe quem tem mensagem nova nem
 * mostra prévia da última): cada linha é só um pedido da lista que a própria
 * página já busca (GET /orders ou /orders/store).
 */
export function ChatConversationList({
  items, activeId, onSelect, emptyLabel = 'Nenhuma conversa ainda.',
}: {
  items: ConversationItem[]
  activeId: string
  onSelect: (id: string) => void
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
          <button
            key={it.id} type="button" onClick={() => onSelect(it.id)}
            className={`${styles.row} ${active ? styles.rowActive : ''}`}
          >
            {it.avatarUrl ? (
              <span className={styles.avatar} style={{ backgroundImage: `url(${it.avatarUrl})` }} />
            ) : (
              <span className={styles.avatarFallback}>{it.name.charAt(0).toUpperCase()}</span>
            )}
            <span className={styles.rowBody}>
              <span className={styles.rowName}>{it.name}</span>
              <span className={styles.rowSub}>{it.subtitle}</span>
            </span>
          </button>
        )
      })}
    </nav>
  )
}
