import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { PaymentTerms } from '../payments/card-plan'

export interface Pricing {
  deliveryBaseFee: number
  deliveryPerKm: number
  deliveryMinFee: number
  courierBaseFee: number
  courierPerKm: number
  platformCommissionPct: number // em % (10 = 10%)
  maxDeliveryValue: number // acima disso (subtotal), só retirada. 0 = sem limite.
  // Anúncios pagos na vitrine
  adPricePerDay: number
  adMinDays: number
  adSlots: number            // quantos anúncios giram ao mesmo tempo
  adPayDeadlineDays: number  // prazo para pagar depois de aprovado
  // Baú dos entregadores (cm/kg): o lojista vê para decidir se o produto precisa
  // de entrega própria.
  courierBoxWidthCm: number
  courierBoxHeightCm: number
  courierBoxDepthCm: number
  courierBoxMaxKg: number
  // Cartão e taxas do meio de pagamento (ver payments/card-plan.ts)
  cardMaxInstallments: number
  cardFreeInstallments: number
  cardInterestMonthlyPct: number
  cardFeePct1x: number
  cardFeePct2to6: number
  cardFeePct7to12: number
  cardFeeFixed: number
  pixFee: number
}

// Padrões = comportamento atual (nada muda até o admin editar).
export const DEFAULT_PRICING: Pricing = {
  deliveryBaseFee: 10,
  deliveryPerKm: 2,
  deliveryMinFee: 0,
  courierBaseFee: 10,
  courierPerKm: 2,
  platformCommissionPct: 10,
  maxDeliveryValue: 1000,
  adPricePerDay: 10,
  adMinDays: 7,
  adSlots: 5,
  adPayDeadlineDays: 3,
  courierBoxWidthCm: 45,
  courierBoxHeightCm: 45,
  courierBoxDepthCm: 45,
  courierBoxMaxKg: 20,
  cardMaxInstallments: 10,
  cardFreeInstallments: 6,
  cardInterestMonthlyPct: 2.99,
  cardFeePct1x: 2.99,
  cardFeePct2to6: 3.49,
  cardFeePct7to12: 3.99,
  cardFeeFixed: 0.49,
  pixFee: 0,
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
          maxDeliveryValue: Number((row as any).maxDeliveryValue ?? DEFAULT_PRICING.maxDeliveryValue),
          adPricePerDay: Number(row.adPricePerDay ?? DEFAULT_PRICING.adPricePerDay),
          adMinDays: row.adMinDays ?? DEFAULT_PRICING.adMinDays,
          adSlots: row.adSlots ?? DEFAULT_PRICING.adSlots,
          adPayDeadlineDays: row.adPayDeadlineDays ?? DEFAULT_PRICING.adPayDeadlineDays,
          courierBoxWidthCm: row.courierBoxWidthCm ?? DEFAULT_PRICING.courierBoxWidthCm,
          courierBoxHeightCm: row.courierBoxHeightCm ?? DEFAULT_PRICING.courierBoxHeightCm,
          courierBoxDepthCm: row.courierBoxDepthCm ?? DEFAULT_PRICING.courierBoxDepthCm,
          courierBoxMaxKg: row.courierBoxMaxKg ?? DEFAULT_PRICING.courierBoxMaxKg,
          cardMaxInstallments: row.cardMaxInstallments ?? DEFAULT_PRICING.cardMaxInstallments,
          cardFreeInstallments: row.cardFreeInstallments ?? DEFAULT_PRICING.cardFreeInstallments,
          cardInterestMonthlyPct: Number(row.cardInterestMonthlyPct ?? DEFAULT_PRICING.cardInterestMonthlyPct),
          cardFeePct1x: Number(row.cardFeePct1x ?? DEFAULT_PRICING.cardFeePct1x),
          cardFeePct2to6: Number(row.cardFeePct2to6 ?? DEFAULT_PRICING.cardFeePct2to6),
          cardFeePct7to12: Number(row.cardFeePct7to12 ?? DEFAULT_PRICING.cardFeePct7to12),
          cardFeeFixed: Number(row.cardFeeFixed ?? DEFAULT_PRICING.cardFeeFixed),
          pixFee: Number(row.pixFee ?? DEFAULT_PRICING.pixFee),
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
  async paymentTerms(): Promise<PaymentTerms> {
    const p = await this.get()
    return {
      maxInstallments: p.cardMaxInstallments,
      freeInstallments: p.cardFreeInstallments,
      interestMonthlyPct: p.cardInterestMonthlyPct,
      cardFeePct1x: p.cardFeePct1x,
      cardFeePct2to6: p.cardFeePct2to6,
      cardFeePct7to12: p.cardFeePct7to12,
      cardFeeFixed: p.cardFeeFixed,
      pixFee: p.pixFee,
    }
  }
  async commissionFor(subtotal: number): Promise<number> {
    const p = await this.get()
    return round2((subtotal * p.platformCommissionPct) / 100)
  }
}
