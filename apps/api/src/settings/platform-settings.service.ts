import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export interface Pricing {
  deliveryBaseFee: number
  deliveryPerKm: number
  deliveryMinFee: number
  courierBaseFee: number
  courierPerKm: number
  platformCommissionPct: number // em % (10 = 10%)
}

// Padrões = comportamento atual (nada muda até o admin editar).
export const DEFAULT_PRICING: Pricing = {
  deliveryBaseFee: 10,
  deliveryPerKm: 2,
  deliveryMinFee: 0,
  courierBaseFee: 10,
  courierPerKm: 2,
  platformCommissionPct: 10,
}

const round2 = (v: number) => Math.round(v * 100) / 100

@Injectable()
export class PlatformSettingsService {
  // Cache curto em memória — evita bater no banco a cada cálculo de pedido; a config
  // muda raramente. Staleness máx. ~30s (aceitável p/ preço; invalidado no update local).
  private cache: { data: Pricing; at: number } | null = null
  private readonly TTL_MS = 30_000

  constructor(private prisma: PrismaService) {}

  async get(): Promise<Pricing> {
    if (this.cache && Date.now() - this.cache.at < this.TTL_MS) return this.cache.data
    const row = await this.prisma.platformSettings.findUnique({ where: { id: 'default' } }).catch(() => null)
    const data: Pricing = row
      ? {
          deliveryBaseFee: Number(row.deliveryBaseFee),
          deliveryPerKm: Number(row.deliveryPerKm),
          deliveryMinFee: Number(row.deliveryMinFee),
          courierBaseFee: Number(row.courierBaseFee),
          courierPerKm: Number(row.courierPerKm),
          platformCommissionPct: Number(row.platformCommissionPct),
        }
      : { ...DEFAULT_PRICING }
    this.cache = { data, at: Date.now() }
    return data
  }

  async update(patch: Partial<Pricing>): Promise<Pricing> {
    const data: Record<string, number> = {}
    for (const k of Object.keys(DEFAULT_PRICING) as (keyof Pricing)[]) {
      if (patch[k] != null && Number.isFinite(patch[k])) data[k] = Number(patch[k])
    }
    await this.prisma.platformSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    })
    this.cache = null // invalida o cache local
    return this.get()
  }

  // ── Helpers de cálculo (uma leitura cacheada por chamada) ──────────────────
  async deliveryFeeFor(distanceKm: number): Promise<number> {
    const p = await this.get()
    return Math.max(p.deliveryMinFee, round2(p.deliveryBaseFee + distanceKm * p.deliveryPerKm))
  }
  async courierFeeFor(distanceKm: number): Promise<number> {
    const p = await this.get()
    return round2(p.courierBaseFee + distanceKm * p.courierPerKm)
  }
  async commissionFor(subtotal: number): Promise<number> {
    const p = await this.get()
    return round2((subtotal * p.platformCommissionPct) / 100)
  }
}
