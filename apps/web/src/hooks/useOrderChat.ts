'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { BASE } from '@/lib/api'

// O gateway de chat roda no mesmo host da API, fora do prefixo /api (setGlobalPrefix
// não afeta o WebSocketGateway do Nest) — então tira o /api antes de conectar.
const WS_BASE = BASE.replace(/\/api\/?$/, '')

export interface ChatMessage {
  id: string
  orderId: string
  senderId: string
  senderRole: string
  content: string
  createdAt: string
  sender?: { id: string; name: string; role: string }
}

export function useOrderChat(orderId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    setMessages([])
    if (!orderId) return
    const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null
    if (!token) return

    const socket = io(`${WS_BASE}/delivery`, { auth: { token }, transports: ['websocket'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('order:watch', { orderId })
      socket.emit('chat:history', { orderId })
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('chat:history', (history: ChatMessage[]) => setMessages(history ?? []))
    socket.on('chat:message', (msg: ChatMessage) => {
      if (msg.orderId !== orderId) return
      setMessages((prev) => [...prev, msg])
    })

    return () => {
      socket.emit('order:unwatch', { orderId })
      socket.disconnect()
      socketRef.current = null
    }
  }, [orderId])

  const sendMessage = useCallback((content: string) => {
    const trimmed = content.trim()
    if (!trimmed || !socketRef.current) return
    socketRef.current.emit('chat:send', { orderId, content: trimmed.slice(0, 500) })
  }, [orderId])

  return { messages, sendMessage, connected }
}
