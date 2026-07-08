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
import { PrismaService } from '../prisma/prisma.service'
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

  constructor(private jwt: JwtService, private prisma: PrismaService) {}

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
  async handleWatch(@ConnectedSocket() client: Socket, @MessageBody() data: { orderId: string }) {
    if (!data?.orderId) return
    const user = (client as any).user as { sub: string } | undefined
    if (!user?.sub || !(await this.isParticipant(data.orderId, user.sub))) return
    client.join(`order:${data.orderId}`)
  }

  @SubscribeMessage('order:unwatch')
  handleUnwatch(@ConnectedSocket() client: Socket, @MessageBody() data: { orderId: string }) {
    if (!data?.orderId) return
    client.leave(`order:${data.orderId}`)
  }

  @SubscribeMessage('courier:location')
  async handleCourierLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string; lat: number; lng: number },
  ) {
    if (!data?.orderId) return
    // Only the courier actually assigned to this order may broadcast its position.
    const user = (client as any).user as { sub: string } | undefined
    if (!user?.sub || !(await this.isAssignedCourier(data.orderId, user.sub))) return
    this.server.to(`order:${data.orderId}`).emit('courier:position', {
      lat: data.lat,
      lng: data.lng,
      ts: Date.now(),
    })
  }

  broadcastPosition(orderId: string, lat: number, lng: number) {
    this.server.to(`order:${orderId}`).emit('courier:position', { lat, lng, ts: Date.now() })
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  @SubscribeMessage('chat:send')
  async handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string; content: string },
  ) {
    if (!data?.orderId || !data?.content?.trim()) return

    const user = (client as any).user as { sub: string; role: string }
    if (!user?.sub) return
    if (!(await this.isParticipant(data.orderId, user.sub))) return

    try {
      const msg = await this.prisma.chatMessage.create({
        data: {
          orderId: data.orderId,
          senderId: user.sub,
          senderRole: user.role,
          content: data.content.trim().slice(0, 500),
        },
        include: { sender: { select: { id: true, name: true, role: true } } },
      })

      this.server.to(`order:${data.orderId}`).emit('chat:message', msg)
    } catch (err) {
      this.logger.warn('Chat message failed', err)
    }
  }

  @SubscribeMessage('chat:history')
  async handleChatHistory(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ) {
    if (!data?.orderId) return
    const user = (client as any).user as { sub: string } | undefined
    if (!user?.sub || !(await this.isParticipant(data.orderId, user.sub))) return
    try {
      const messages = await this.prisma.chatMessage.findMany({
        where: { orderId: data.orderId },
        include: { sender: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: 'asc' },
        take: 100,
      })
      client.emit('chat:history', messages)
    } catch {}
  }

  /** True if the user is the order's consumer, the store owner, or the assigned courier. */
  private async isParticipant(orderId: string, userId: string): Promise<boolean> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        userId: true,
        store: { select: { userId: true } },
        delivery: { select: { courier: { select: { userId: true } } } },
      },
    })
    if (!order) return false
    return (
      order.userId === userId ||
      order.store?.userId === userId ||
      order.delivery?.courier?.userId === userId
    )
  }

  /** True only if the user is the courier currently assigned to this order. */
  private async isAssignedCourier(orderId: string, userId: string): Promise<boolean> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { orderId },
      select: { courier: { select: { userId: true } } },
    })
    return delivery?.courier?.userId === userId
  }

  private extractToken(client: Socket): string | null {
    const authHeader = client.handshake.headers?.authorization
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)
    const queryToken = client.handshake.auth?.token ?? client.handshake.query?.token
    return typeof queryToken === 'string' ? queryToken : null
  }
}
