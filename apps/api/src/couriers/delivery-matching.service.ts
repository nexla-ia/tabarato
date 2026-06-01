import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../common/push.service'

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

interface MatchState {
  offeredTo: Set<string>
  timeout: ReturnType<typeof setTimeout> | null
}

@Injectable()
export class DeliveryMatchingService {
  private readonly logger = new Logger(DeliveryMatchingService.name)
  private readonly state = new Map<string, MatchState>()

  constructor(
    private prisma: PrismaService,
    private push: PushService,
  ) {}

  async startMatching(deliveryId: string, storeLat: number, storeLng: number) {
    this.logger.log(`[Match] Starting for delivery ${deliveryId.slice(0, 8)}`)
    this.state.set(deliveryId, { offeredTo: new Set(), timeout: null })
    await this.tryRadius(deliveryId, storeLat, storeLng, 1)
  }

  cancelMatching(deliveryId: string) {
    const entry = this.state.get(deliveryId)
    if (entry?.timeout) clearTimeout(entry.timeout)
    this.state.delete(deliveryId)
    this.logger.log(`[Match] Cancelled for delivery ${deliveryId.slice(0, 8)}`)
  }

  private async tryRadius(deliveryId: string, storeLat: number, storeLng: number, radiusKm: number) {
    // Confirm delivery is still unassigned
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } })
    if (!delivery || delivery.courierId || delivery.status !== 'SEARCHING_COURIER') {
      this.cancelMatching(deliveryId)
      return
    }

    const entry = this.state.get(deliveryId)
    if (!entry) return

    // Find online approved couriers with GPS, not already offered
    const couriers = await this.prisma.courier.findMany({
      where: {
        status: 'APPROVED',
        isOnline: true,
        currentLat: { not: null },
        currentLng: { not: null },
        id: entry.offeredTo.size ? { notIn: [...entry.offeredTo] } : undefined,
      },
      include: { user: { select: { pushToken: true, name: true } } },
    })

    // Filter by radius, sort by proximity
    const nearby = couriers
      .filter(c => haversineKm(storeLat, storeLng, c.currentLat!, c.currentLng!) <= radiusKm)
      .sort((a, b) =>
        haversineKm(storeLat, storeLng, a.currentLat!, a.currentLng!) -
        haversineKm(storeLat, storeLng, b.currentLat!, b.currentLng!),
      )

    if (nearby.length > 0) {
      const closest = nearby[0]
      entry.offeredTo.add(closest.id)
      this.logger.log(`[Match] Offering to courier ${closest.id.slice(0, 8)} within ${radiusKm}km`)

      if (closest.user?.pushToken) {
        this.push.send(
          closest.user.pushToken,
          '🛵 Nova entrega disponível!',
          `R$ ${delivery.courierFee.toFixed(2)} · ${delivery.distanceKm.toFixed(1)} km — aceite em 30s`,
          { deliveryId, type: 'NEW_DELIVERY' },
        )
      }
    } else {
      this.logger.log(`[Match] No couriers within ${radiusKm}km — waiting 30s to expand`)
    }

    const NEXT: Record<number, number | null> = { 1: 2, 2: 3, 3: null }
    const nextRadius = NEXT[radiusKm]

    const timeout = setTimeout(async () => {
      if (!this.state.has(deliveryId)) return

      // Check again if delivery was accepted during the 30s
      const current = await this.prisma.delivery.findUnique({ where: { id: deliveryId } })
      if (!current || current.courierId || current.status !== 'SEARCHING_COURIER') {
        this.cancelMatching(deliveryId)
        return
      }

      if (nextRadius) {
        await this.tryRadius(deliveryId, storeLat, storeLng, nextRadius)
      } else {
        this.logger.log(`[Match] No courier found after 3km for ${deliveryId.slice(0, 8)} — delivery stays open`)
        this.cancelMatching(deliveryId)
      }
    }, 30_000)

    entry.timeout = timeout
  }
}
