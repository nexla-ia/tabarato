import { BadRequestException } from '@nestjs/common'
import { ProductsService } from './products.service'

function makeService() {
  const prisma = {
    store: { findUnique: jest.fn() },
    product: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    orderItem: { groupBy: jest.fn() },
    $queryRaw: jest.fn(),
  }
  return { svc: new ProductsService(prisma as any), prisma }
}

const loja = { id: 's1', userId: 'u1' }

describe('ProductsService — preço "de" das ofertas', () => {
  it('recusa preço "de" menor ou igual ao preço atual', async () => {
    const { svc, prisma } = makeService()
    prisma.store.findUnique.mockResolvedValue(loja)

    await expect(
      svc.create('u1', 's1', { name: 'X', basePrice: 30, comparePrice: 30 } as any),
    ).rejects.toBeInstanceOf(BadRequestException)

    expect(prisma.product.create).not.toHaveBeenCalled()
  })

  it('aceita quando há desconto de verdade', async () => {
    const { svc, prisma } = makeService()
    prisma.store.findUnique.mockResolvedValue(loja)
    prisma.product.create.mockResolvedValue({ id: 'p1' })

    await svc.create('u1', 's1', { name: 'X', basePrice: 29, comparePrice: 40 } as any)

    expect(prisma.product.create).toHaveBeenCalled()
  })

  it('null limpa a oferta em vez de dar erro', async () => {
    const { svc, prisma } = makeService()
    prisma.store.findUnique.mockResolvedValue(loja)
    prisma.product.create.mockResolvedValue({ id: 'p1' })

    await svc.create('u1', 's1', { name: 'X', basePrice: 29, comparePrice: null } as any)

    expect(prisma.product.create.mock.calls[0][0].data.comparePrice).toBeNull()
  })

  it('produto com variações não aceita oferta (preço ambíguo)', async () => {
    const { svc, prisma } = makeService()
    prisma.store.findUnique.mockResolvedValue(loja)

    await expect(
      svc.create('u1', 's1', { name: 'X', comparePrice: 40 } as any),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('na edição parcial, compara com o preço JÁ SALVO', async () => {
    const { svc, prisma } = makeService()
    // basePrice não vem no corpo; o salvo é 50, então "de" 40 não é desconto.
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', basePrice: 50, store: loja })

    await expect(
      svc.update('u1', 'p1', { comparePrice: 40 } as any),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('ProductsService.findOffers', () => {
  it('sem oferta nenhuma → lista vazia, sem segunda consulta', async () => {
    const { svc, prisma } = makeService()
    prisma.$queryRaw.mockResolvedValue([])

    expect(await svc.findOffers(12)).toEqual([])
    expect(prisma.product.findMany).not.toHaveBeenCalled()
  })

  it('calcula o % de desconto e respeita a ordem do ranking', async () => {
    const { svc, prisma } = makeService()
    prisma.$queryRaw.mockResolvedValue([{ id: 'p2' }, { id: 'p1' }])
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', basePrice: 80, comparePrice: 100 },
      { id: 'p2', basePrice: 25, comparePrice: 100 },
    ])

    const out = await svc.findOffers(12)

    expect(out.map(p => p.id)).toEqual(['p2', 'p1']) // maior desconto primeiro
    expect(out[0].descontoPct).toBe(75)
    expect(out[1].descontoPct).toBe(20)
  })
})

describe('ProductsService.findPopular — janela dos destaques', () => {
  it('com janela, conta só pedido ENTREGUE do período', async () => {
    const { svc, prisma } = makeService()
    prisma.orderItem.groupBy.mockResolvedValue([])

    await svc.findPopular(12, 7)

    const where = prisma.orderItem.groupBy.mock.calls[0][0].where
    expect(where.order.status).toBe('DELIVERED')
    expect(where.order.createdAt.gte).toBeInstanceOf(Date)
  })

  it('sem janela (populares de sempre), não filtra por data', async () => {
    const { svc, prisma } = makeService()
    prisma.orderItem.groupBy.mockResolvedValue([])

    await svc.findPopular(12)

    expect(prisma.orderItem.groupBy.mock.calls[0][0].where).toBeUndefined()
  })

  it('período sem venda → vazio, sem buscar produtos', async () => {
    const { svc, prisma } = makeService()
    prisma.orderItem.groupBy.mockResolvedValue([])

    expect(await svc.findPopular(12, 7)).toEqual([])
    expect(prisma.product.findMany).not.toHaveBeenCalled()
  })
})
