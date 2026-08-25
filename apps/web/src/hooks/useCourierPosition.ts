'use client'
import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { BASE } from '@/lib/api'

// Mesmo host da API, fora do /api (o WebSocketGateway não usa o prefixo global).
const WS_BASE = BASE.replace(/\/api\/?$/, '')

// Posição ao vivo do entregador via socket (/delivery → courier:position), enquanto
// a entrega está ativa. Retorna null até chegar a primeira posição.
export function useCourierPosition(orderId: string | null, active: boolean) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    if (!orderId || !active) { setPos(null); return }
    const token = typeof window !== 'undefined' ? localStorage.getItem('tb_token') : null
    if (!token) return

    const socket = io(`${WS_BASE}/delivery`, { auth: { token }, transports: ['websocket'] })
    socket.on('connect', () => socket.emit('order:watch', { orderId }))
    socket.on('courier:position', (d: { lat?: number; lng?: number }) => {
      if (typeof d?.lat === 'number' && typeof d?.lng === 'number') setPos({ lat: d.lat, lng: d.lng })
    })

    return () => {
      socket.emit('order:unwatch', { orderId })
      socket.disconnect()
    }
  }, [orderId, active])

  return pos
}
