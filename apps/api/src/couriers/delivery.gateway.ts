import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets'
import { Logger } from '@nestjs/common'
import { Server, Socket } from 'socket.io'

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/delivery',
})
export class DeliveryGateway implements OnGatewayInit {
  @WebSocketServer() server: Server
  private readonly logger = new Logger(DeliveryGateway.name)

  afterInit() {
    this.logger.log('DeliveryGateway initialized')
  }

  // Consumer joins a room to watch courier position for their order
  @SubscribeMessage('order:watch')
  handleWatch(@ConnectedSocket() client: Socket, @MessageBody() data: { orderId: string }) {
    client.join(`order:${data.orderId}`)
  }

  // Courier sends their GPS position directly via socket (low-latency path)
  @SubscribeMessage('courier:location')
  handleCourierLocation(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: { orderId: string; lat: number; lng: number },
  ) {
    this.server.to(`order:${data.orderId}`).emit('courier:position', {
      lat: data.lat,
      lng: data.lng,
      ts: Date.now(),
    })
  }

  // Called by CouriersService after REST location update — ensures consumers always receive
  broadcastPosition(orderId: string, lat: number, lng: number) {
    this.server.to(`order:${orderId}`).emit('courier:position', { lat, lng, ts: Date.now() })
  }
}
