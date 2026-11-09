import { BadRequestException } from '@nestjs/common'
import { OrdersService, storeShareOf } from './orders.service'

const base = { subtotal: 100, couponDiscount: 0, promoDiscount: 0, commission: 10, deliveryFee: 15 }

describe('storeShareOf', () => {
  it('entrega por motoboy: frete fica com a plataforma', () => {
    expect(storeShareOf({ ...base, freeShipping: false, storeDelivers: false })).toBe(90)
  })

  it('entrega por motoboy com frete grátis: a loja banca o frete', () => {
    expect(storeShareOf({ ...base, freeShipping: true, storeDelivers: false })).toBe(75)
  })

  it('entrega pela loja: o frete é da loja', () => {
    expect(storeShareOf({ ...base, freeShipping: false, storeDelivers: true })).toBe(105)
  })

  it('entrega pela loja com frete grátis: só não recebe o frete', () => {
    expect(storeShareOf({ ...base, freeShipping: true, storeDelivers: true })).toBe(90)
  })

  it('nunca fica negativo', () => {
    expect(storeShareOf({ ...base, subtotal: 5, freeShipping: true, storeDelivers: false })).toBe(0)
  })
})

describe('OrdersService — entrega pela loja', () => {
  function montar(order: any) {
    const prisma: any = {
      store: { findUnique: jest.fn().mockResolvedValue({ id: 's1', userId: 'u-loja', lat: 0, lng: 0 }) },
      order: {
        findFirst: jest.fn().mockResolvedValue(order),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...order, ...data, user: { pushToken: null } })),
      },
      orderStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      delivery: { findUnique: jest.fn(), create: jest.fn() },
    }
    const settings: any = { commissionFor: jest.fn().mockResolvedValue(10) }
    const wallet: any = { credit: jest.fn().mockResolvedValue({}) }
    const loyalty: any = { earnPoints: jest.fn().mockResolvedValue({}) }
    const push: any = { send: jest.fn() }
    const notifications: any = { create: jest.fn().mockResolvedValue({}) }
    const matching: any = { startMatching: jest.fn().mockResolvedValue({}) }
    const svc = new OrdersService(prisma, {} as any, push, notifications, {} as any, {} as any, {} as any, settings, wallet, loyalty, matching)
    return { svc, prisma, wallet, matching }
  }

  const pedido = {
    id: 'o1234567', userId: 'u1', storeId: 's1', status: 'READY', fulfillmentType: 'STORE_DELIVERY',
    subtotal: 100, couponDiscount: 0, promoDiscount: 0, deliveryFee: 15, freeShipping: false,
    paidViaSplit: false, payment: { status: 'PAID' }, address: { lat: 0, lng: 0 }, user: { id: 'u1', pushToken: null },
  }

  it('loja confirma a entrega com o código e recebe produto + frete', async () => {
    const { svc, prisma, wallet } = montar({ ...pedido, status: 'PICKED_UP' })
    await svc.confirmPickup('u-loja', 'o1234567', '123456')
    expect(prisma.order.updateMany.mock.calls[0][0].where.status).toEqual({ in: ['READY', 'PICKED_UP'] })
    expect(wallet.credit).toHaveBeenCalledWith('s1', 'STORE', 105, expect.stringContaining('entrega própria'), 'o1234567')
  })

  it('código errado não entrega', async () => {
    const { svc, prisma, wallet } = montar(pedido)
    prisma.order.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(svc.confirmPickup('u-loja', 'o1234567', '000000')).rejects.toThrow(BadRequestException)
    expect(wallet.credit).not.toHaveBeenCalled()
  })

  it('retirada continua sem frete no repasse', async () => {
    const { svc, wallet } = montar({ ...pedido, fulfillmentType: 'PICKUP', deliveryFee: 0 })
    await svc.confirmPickup('u-loja', 'o1234567', '123456')
    expect(wallet.credit).toHaveBeenCalledWith('s1', 'STORE', 90, expect.stringContaining('retirada'), 'o1234567')
  })

  it('pedido com entregador do app não é confirmado pela loja', async () => {
    const { svc } = montar({ ...pedido, fulfillmentType: 'DELIVERY' })
    await expect(svc.confirmPickup('u-loja', 'o1234567', '123456')).rejects.toThrow(BadRequestException)
  })

  it('"Pronto" não chama entregador e a loja pode marcar "Saiu para entrega"', async () => {
    const { svc, prisma, matching } = montar({ ...pedido, status: 'PREPARING' })
    await svc.updateStatus('u-loja', 'o1234567', 'READY' as any)
    expect(prisma.delivery.create).not.toHaveBeenCalled()
    expect(matching.startMatching).not.toHaveBeenCalled()

    const { svc: svc2, prisma: prisma2 } = montar({ ...pedido, status: 'READY' })
    await svc2.updateStatus('u-loja', 'o1234567', 'PICKED_UP' as any)
    expect(prisma2.order.update).toHaveBeenCalled()
  })

  it('pedido com entregador do app não pode ir para "Saiu para entrega" pela loja', async () => {
    const { svc } = montar({ ...pedido, fulfillmentType: 'DELIVERY', status: 'READY' })
    await expect(svc.updateStatus('u-loja', 'o1234567', 'PICKED_UP' as any)).rejects.toThrow('Transição de status não permitida.')
  })
})
