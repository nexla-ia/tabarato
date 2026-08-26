'use client'
import { useEffect, useRef, useState } from 'react'
import { Send, Lock } from 'lucide-react'
import { useOrderChat, ChatClosedReason } from '@/hooks/useOrderChat'
import styles from './OrderChat.module.css'

const ROLE_LABEL: Record<string, string> = {
  CONSUMER: 'Cliente', STORE_OWNER: 'Loja', COURIER: 'Entregador', ADMIN: 'Suporte',
}

const CLOSED_MESSAGE: Record<ChatClosedReason, string> = {
  DELIVERED: 'Pedido entregue — a conversa foi encerrada.',
  CANCELLED: 'Pedido cancelado — a conversa foi encerrada.',
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function OrderChat({
  orderId, currentUserId, fill = false, closedReason,
}: {
  orderId: string
  currentUserId: string
  /** Cresce pra preencher a altura do container (tela dedicada de chat) em vez
   *  do box baixinho (220–360px) usado quando o chat vem embutido numa página maior. */
  fill?: boolean
  /** Pedido já entregue/cancelado quando o chat abriu — quem chama já sabe o
   *  status (a lista de Mensagens busca isso de qualquer forma), então trava
   *  o composer de cara em vez de deixar tentar mandar pra só então avisar. */
  closedReason?: ChatClosedReason
}) {
  const { messages, sendMessage, connected, liveClosedReason } = useOrderChat(orderId)
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  // Cobre os dois casos: pedido já estava fechado ao abrir (prop) ou fechou
  // agora, com o chat já aberto (evento do socket ao tentar mandar).
  const closed = closedReason ?? liveClosedReason

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  function handleSend() {
    if (!text.trim() || closed) return
    sendMessage(text)
    setText('')
  }

  return (
    <div className={`${styles.chat} ${fill ? styles.chatFill : ''}`}>
      <div className={`${styles.messages} ${fill ? styles.messagesFill : ''}`}>
        {messages.length === 0 ? (
          <p className={styles.empty}>{connected ? 'Nenhuma mensagem ainda.' : 'Conectando…'}</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === currentUserId
            return (
              <div key={m.id} className={`${styles.bubbleRow} ${mine ? styles.bubbleRowMine : ''}`}>
                <div className={`${styles.bubble} ${mine ? styles.bubbleMine : ''}`}>
                  {!mine && (
                    <span className={styles.bubbleSender}>{m.sender?.name ?? ROLE_LABEL[m.senderRole] ?? 'Participante'}</span>
                  )}
                  <span className={styles.bubbleText}>{m.content}</span>
                  <span className={styles.bubbleTime}>{fmtTime(m.createdAt)}</span>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
      {closed ? (
        <div className={styles.closedBanner}>
          <Lock size={14} />
          <span>{CLOSED_MESSAGE[closed]}</span>
        </div>
      ) : (
        <div className={styles.inputRow}>
          <input
            className={styles.input}
            placeholder="Escreva uma mensagem…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
            maxLength={500}
          />
          <button className={styles.sendBtn} onClick={handleSend} disabled={!text.trim() || !connected} title="Enviar">
            <Send size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
