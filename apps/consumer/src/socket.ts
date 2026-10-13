import { io, Socket } from 'socket.io-client'

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') ?? 'http://localhost:3000'

let socket: Socket | null = null
let socketToken: string | undefined

export function getDeliverySocket(token?: string): Socket {
  // Reaproveita o socket existente (mesmo em reconexão) desde que o token não mude.
  // Antes, um socket temporariamente desconectado era descartado, perdendo a
  // reconexão em andamento e os listeners.
  if (socket && socketToken === token) return socket

  // Token mudou (ou primeiro uso) → recria
  socket?.disconnect()
  socketToken = token

  socket = io(`${API_URL}/delivery`, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 2000,
    auth: token ? { token } : undefined,
  })

  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
