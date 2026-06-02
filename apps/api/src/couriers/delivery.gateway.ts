import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets'
import { Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Server, Socket } from 'socket.io'

@WebSocketGateway({
  cors: {
    origin: (origin: string, cb: (err: Error | null, allow?: boolean) => void) => {
      const allowed = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : []
      const isLocalhost = !origin || /^http:\/\/localhost(:\d+)?$/.test(origin)
      cb(null, isLocalhost || allowed.includes(origin))
    },
    credentials: true,
  },
  namespace: '/delivery',
})
export class DeliveryGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server
  private readonly logger = new Logger(DeliveryGateway.name)

  constructor(private jwt: JwtService) {}

  afterInit() {
    this.logger.log('DeliveryGateway initialized')
  }

  handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client)
      if (!token) { client.disconnect(true); return }

      const payload = this.jwt.verify(token) as { sub: string; role: string }
      ;(client as any).user = payload
    } catch {
      this.logger.warn('WS connection rejected: invalid or missing token')
      client.disconnect(true)
    }
  }

  handleDisconnect(client: Socket) {
    for (const room of client.rooms) {
      if (room !== client.id) client.leave(room)
    }
  }

  @SubscribeMessage('order:watch')
  handleWatch(@ConnectedSocket() client: Socket, @MessageBody() data: { orderId: string }) {
    if (!data?.orderId) return
    client.join(`order:${data.orderId}`)
  }

  @SubscribeMessage('order:unwatch')
  handleUnwatch(@ConnectedSocket() client: Socket, @MessageBody() data: { orderId: string }) {
    if (!data?.orderId) return
    client.leave(`order:${data.orderId}`)
  }

  @SubscribeMessage('courier:location')
  handleCourierLocation(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: { orderId: string; lat: number; lng: number },
  ) {
    if (!data?.orderId) return
    this.server.to(`order:${data.orderId}`).emit('courier:position', {
      lat: data.lat,
      lng: data.lng,
      ts: Date.now(),
    })
  }

  broadcastPosition(orderId: string, lat: number, lng: number) {
    this.server.to(`order:${orderId}`).emit('courier:position', { lat, lng, ts: Date.now() })
  }

  private extractToken(client: Socket): string | null {
    const authHeader = client.handshake.headers?.authorization
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)
    const queryToken = client.handshake.auth?.token ?? client.handshake.query?.token
    return typeof queryToken === 'string' ? queryToken : null
  }
}
