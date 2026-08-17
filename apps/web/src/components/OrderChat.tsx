'use client'
import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { useOrderChat } from '@/hooks/useOrderChat'
import styles from './OrderChat.module.css'

const ROLE_LABEL: Record<string, string> = {
  CONSUMER: 'Cliente', STORE_OWNER: 'Loja', COURIER: 'Entregador', ADMIN: 'Suporte',
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function OrderChat({ orderId, currentUserId }: { orderId: string; currentUserId: string }) {
  const { messages, sendMessage, connected } = useOrderChat(orderId)
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  function handleSend() {
    if (!text.trim()) return
    sendMessage(text)
    setText('')
  }

  return (
    <div className={styles.chat}>
      <div className={styles.messages}>
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
    </div>
  )
}
