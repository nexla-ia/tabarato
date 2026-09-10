import { PlatformSettingsService } from './platform-settings.service'

function make(row: any) {
  const prisma = { platformSettings: { findUnique: jest.fn().mockResolvedValue(row), upsert: jest.fn() } }
  return { svc: new PlatformSettingsService(prisma as any), prisma }
}

describe('PlatformSettingsService', () => {
  it('sem row → usa os padrões (entrega 10 + 2/km, comissão 10%)', async () => {
    const { svc } = make(null)
    expect(await svc.deliveryFeeFor(3)).toBe(16) // 10 + 3*2
    expect(await svc.courierFeeFor(3)).toBe(16)
    expect(await svc.commissionFor(50)).toBe(5) // 10% de 50
  })

  it('usa os valores configurados (com piso da taxa)', async () => {
    const { svc } = make({
      deliveryBaseFee: 8, deliveryPerKm: 3, deliveryMinFee: 12,
      courierBaseFee: 6, courierPerKm: 2, platformCommissionPct: 15,
    })
    expect(await svc.deliveryFeeFor(2)).toBe(14) // 8 + 2*3 = 14
    expect(await svc.deliveryFeeFor(1)).toBe(12) // 8 + 1*3 = 11 → piso 12
    expect(await svc.courierFeeFor(2)).toBe(10)  // 6 + 2*2
    expect(await svc.commissionFor(100)).toBe(15) // 15% de 100
  })

  it('update grava só campos válidos e invalida o cache', async () => {
    const { svc, prisma } = make(null)
    await svc.get() // popula cache
    prisma.platformSettings.upsert.mockResolvedValue({})
    prisma.platformSettings.findUnique.mockResolvedValue({
      deliveryBaseFee: 5, deliveryPerKm: 1, deliveryMinFee: 0,
      courierBaseFee: 5, courierPerKm: 1, platformCommissionPct: 8,
    })
    await svc.update({ deliveryBaseFee: 5, platformCommissionPct: 8, deliveryPerKm: NaN as any })
    // NaN não deve ser gravado
    const sent = prisma.platformSettings.upsert.mock.calls[0][0].update
    expect(sent).toHaveProperty('deliveryBaseFee', 5)
    expect(sent).toHaveProperty('platformCommissionPct', 8)
    expect(sent).not.toHaveProperty('deliveryPerKm')
    // cache invalidado → relê e reflete o novo valor
    expect(await svc.commissionFor(100)).toBe(8)
  })
})
