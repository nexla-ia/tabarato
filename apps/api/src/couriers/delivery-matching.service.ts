import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
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
  storeLat: number
  storeLng: number
  currentRadius: number
}

@Injectable()
export class DeliveryMatchingService implements OnModuleInit {
  private readonly logger = new Logger(DeliveryMatchingService.name)
  private readonly state = new Map<string, MatchState>()
  // Entregas órfãs já alertadas ao lojista — evita reenviar o mesmo push a cada varredura.
  private readonly alertedOrphans = new Set<string>()

  // Re-oferece entregas que ficaram órfãs (matching desistiu após 3km e a corrida
  // ficou "aberta" sem ninguém sendo notificado) e, se demorar demais, avisa o lojista.
  private static readonly RESWEEP_AFTER_MIN = 10
  private static readonly ALERT_AFTER_MIN = 45

  constructor(
    private prisma: PrismaService,
    private push: PushService,
  ) {}

  // On startup, resume matching for any deliveries stuck in SEARCHING_COURIER
  async onModuleInit() {
    try {
      const stuck = await this.prisma.delivery.findMany({
        where: { status: 'SEARCHING_COURIER', courierId: null },
        include: { order: { include: { store: { select: { lat: true, lng: true } } } } },
      })
      if (stuck.length > 0) {
        this.logger.log(`[Match] Resuming matching for ${stuck.length} stuck deliveries`)
        for (const d of stuck) {
          if (!this.state.has(d.id)) {
            await this.startMatching(d.id, d.order.store.lat, d.order.store.lng)
          }
        }
      }
    } catch (err) {
      this.logger.warn('[Match] Failed to resume stuck deliveries on startup', err)
    }
  }

  // Varredura periódica de entregas "esquecidas": SEARCHING_COURIER sem entregador,
  // que já saíram do ciclo de matching em memória (nenhum motoboy achado nos 3km, ou
  // um return sem re-match). Antes elas ficavam abertas para sempre — o cliente pagou
  // e nunca aparecia entregador, sem ninguém ser avisado.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async resweepOrphanDeliveries() {
    try {
      const orphans = await this.prisma.delivery.findMany({
        where: { status: 'SEARCHING_COURIER', courierId: null },
        include: { order: { include: { store: { select: { name: true, lat: true, lng: true, user: { select: { pushToken: true } } } } } } },
      })
      const now = Date.now()
      for (const d of orphans) {
        // Já está sendo trabalhada em memória (ciclo de matching ativo) — não mexe.
        if (this.state.has(d.id)) continue
        const ageMin = (now - new Date(d.createdAt).getTime()) / 60000
        if (ageMin < DeliveryMatchingService.RESWEEP_AFTER_MIN) continue

        const store = d.order?.store
        if (!store || store.lat == null || store.lng == null) continue

        // Re-abre o ciclo do zero (raio 1km) — dá chance a entregadores que ficaram
        // online depois que o matching original desistiu.
        this.logger.log(`[Match] Re-sweeping orphan delivery ${d.id.slice(0, 8)} (${Math.round(ageMin)}min aberta)`)
        await this.startMatching(d.id, store.lat, store.lng)

        // Passou do limite e ainda ninguém: avisa o lojista UMA vez para ele decidir
        // (entrega própria / cancelar). Não cancela nem estorna automático — decisão de negócio.
        if (ageMin >= DeliveryMatchingService.ALERT_AFTER_MIN && !this.alertedOrphans.has(d.id)) {
          this.alertedOrphans.add(d.id)
          const token = store.user?.pushToken
          if (token) {
            this.push.send(
              token,
              '⚠️ Pedido sem entregador',
              `O pedido #${d.orderId.slice(0, 8)} está há mais de ${DeliveryMatchingService.ALERT_AFTER_MIN}min sem entregador. Considere entrega própria ou cancelar.`,
              { orderId: d.orderId, type: 'NO_COURIER' },
            ).catch(() => {})
          }
        }
      }
      // Limpa da memória alertas de entregas que já saíram de SEARCHING_COURIER.
      if (this.alertedOrphans.size) {
        const stillOpen = new Set(orphans.map((o) => o.id))
        for (const id of this.alertedOrphans) if (!stillOpen.has(id)) this.alertedOrphans.delete(id)
      }
    } catch (err) {
      this.logger.warn('[Match] resweepOrphanDeliveries failed', err)
    }
  }

  async startMatching(deliveryId: string, storeLat: number, storeLng: number) {
    this.logger.log(`[Match] Starting for delivery ${deliveryId.slice(0, 8)}`)
    // Limpa qualquer ciclo anterior (e seu timer armado) antes de reiniciar —
    // evita timer órfão disparando tryRadius em paralelo (double-offer / radius pulado).
    const prev = this.state.get(deliveryId)
    if (prev?.timeout) clearTimeout(prev.timeout)
    this.state.set(deliveryId, { offeredTo: new Set(), timeout: null, storeLat, storeLng, currentRadius: 1 })
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

    entry.currentRadius = radiusKm

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
          `R$ ${Number(delivery.courierFee).toFixed(2)} · ${Number(delivery.distanceKm).toFixed(1)} km — aceite em 30s`,
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
