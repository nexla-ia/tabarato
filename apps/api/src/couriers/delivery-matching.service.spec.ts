import { DeliveryMatchingService } from './delivery-matching.service'

// Coração do fluxo do motoboy: a quem a corrida é ofertada, em que ordem e por quanto
// tempo. Testes unitários puros (sem DB), com timers falsos pro escalonamento de raio.

const STORE = { lat: -12.7406, lng: -60.1457 } // Vilhena-RO
// ~111m por 0.001° de latitude — posiciona entregadores a distâncias conhecidas.
const atMeters = (m: number) => ({ currentLat: STORE.lat + m / 111_000, currentLng: STORE.lng })

function courier(id: string, meters: number, over: any = {}) {
  return {
    id, userId: `u-${id}`, ...atMeters(meters),
    user: { pushToken: `tok-${id}`, name: id },
    ...over,
  }
}

function makeMatching(over: any = {}) {
  const prisma = {
    delivery: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    courier: { findMany: jest.fn().mockResolvedValue([]) },
    order: { findUnique: jest.fn() },
    ...(over.prisma ?? {}),
  }
  const push = { send: jest.fn().mockResolvedValue(undefined), ...(over.push ?? {}) }
  const gateway = { notifyCourierNewDelivery: jest.fn(), ...(over.gateway ?? {}) }
  const svc = new DeliveryMatchingService(prisma as any, push as any, gateway as any)
  return { svc, prisma, push, gateway }
}

/** Entrega viva, aguardando entregador. */
const searching = (over: any = {}) => ({
  id: 'd1', orderId: 'o1', courierId: null, status: 'SEARCHING_COURIER',
  matchingExpired: false, refusedCourierIds: [], courierFee: 8, distanceKm: 3.2,
  order: { status: 'CONFIRMED' },
  ...over,
})

afterEach(() => { jest.useRealTimers() })

describe('DeliveryMatchingService.startMatching (oferta)', () => {
  it('oferta aos 3 MAIS PRÓXIMOS dentro de 1km (lote), ignorando os demais', async () => {
    const { svc, prisma, push, gateway } = makeMatching()
    prisma.delivery.findUnique.mockResolvedValue(searching())
    prisma.courier.findMany.mockResolvedValue([
      courier('c4', 700), courier('c1', 44), courier('c3', 489), courier('c2', 156),
    ])

    await svc.startMatching('d1', STORE.lat, STORE.lng)

    // Só 3 ofertas, e são os 3 mais próximos (c1, c2, c3) — c4 (700m) fica de fora.
    expect(push.send).toHaveBeenCalledTimes(3)
    const notified = push.send.mock.calls.map((c: any[]) => c[0])
    expect(notified).toEqual(['tok-c1', 'tok-c2', 'tok-c3'])
    expect(gateway.notifyCourierNewDelivery).toHaveBeenCalledTimes(3)
    svc.cancelMatching('d1')
  })

  it('push da corrida leva orderId + type (senão o toque não navega com o app fechado)', async () => {
    const { svc, prisma, push } = makeMatching()
    prisma.delivery.findUnique.mockResolvedValue(searching())
    prisma.courier.findMany.mockResolvedValue([courier('c1', 50)])

    await svc.startMatching('d1', STORE.lat, STORE.lng)

    expect(push.send).toHaveBeenCalledWith(
      'tok-c1',
      expect.stringContaining('Nova entrega'),
      expect.stringContaining('R$ 8.00'),
      { deliveryId: 'd1', orderId: 'o1', type: 'NEW_DELIVERY' },
    )
    svc.cancelMatching('d1')
  })

  it('entregador FORA do raio de 1km não recebe oferta', async () => {
    const { svc, prisma, push } = makeMatching()
    prisma.delivery.findUnique.mockResolvedValue(searching())
    prisma.courier.findMany.mockResolvedValue([courier('longe', 2500)])

    await svc.startMatching('d1', STORE.lat, STORE.lng)

    expect(push.send).not.toHaveBeenCalled()
    svc.cancelMatching('d1')
  })

  it('a busca exclui quem RECUSOU e quem já tem entrega ativa', async () => {
    const { svc, prisma } = makeMatching()
    prisma.delivery.findUnique.mockResolvedValue(searching({ refusedCourierIds: ['c9'] }))

    await svc.startMatching('d1', STORE.lat, STORE.lng)

    expect(prisma.courier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'APPROVED',
          isOnline: true,
          id: { notIn: ['c9'] },
          deliveries: { none: { status: { notIn: ['SEARCHING_COURIER', 'DELIVERED', 'FAILED'] } } },
        }),
      }),
    )
    svc.cancelMatching('d1')
  })
})

describe('DeliveryMatchingService (corrida morta não é ofertada)', () => {
  it.each([
    ['já tem entregador', { courierId: 'c1' }],
    ['status não é SEARCHING_COURIER', { status: 'PICKED_UP' }],
    ['busca expirada', { matchingExpired: true }],
    ['pedido cancelado', { order: { status: 'CANCELLED' } }],
    ['pedido já entregue', { order: { status: 'DELIVERED' } }],
  ])('%s → não oferta a ninguém', async (_label, over) => {
    const { svc, prisma, push } = makeMatching()
    prisma.delivery.findUnique.mockResolvedValue(searching(over))
    prisma.courier.findMany.mockResolvedValue([courier('c1', 50)])

    await svc.startMatching('d1', STORE.lat, STORE.lng)

    expect(push.send).not.toHaveBeenCalled()
    expect(prisma.courier.findMany).not.toHaveBeenCalled()
  })
})

describe('DeliveryMatchingService (escalonamento de raio 1→2→3km a cada 30s)', () => {
  it('ninguém em 1km; entregador a 2,5km só é ofertado quando o raio chega a 3km', async () => {
    jest.useFakeTimers()
    const { svc, prisma, push } = makeMatching()
    prisma.delivery.findUnique.mockResolvedValue(searching())
    prisma.courier.findMany.mockResolvedValue([courier('medio', 2500)])

    await svc.startMatching('d1', STORE.lat, STORE.lng) // raio 1km
    expect(push.send).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(30_000) // → raio 2km (2,5km ainda fora)
    expect(push.send).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(30_000) // → raio 3km (agora entra)
    expect(push.send).toHaveBeenCalledTimes(1)
    expect(push.send).toHaveBeenCalledWith('tok-medio', expect.any(String), expect.any(String), expect.any(Object))

    svc.cancelMatching('d1')
  })

  it('cancelMatching desarma o timer — nenhuma oferta depois de cancelar', async () => {
    jest.useFakeTimers()
    const { svc, prisma, push } = makeMatching()
    prisma.delivery.findUnique.mockResolvedValue(searching())
    prisma.courier.findMany.mockResolvedValue([courier('medio', 2500)])

    await svc.startMatching('d1', STORE.lat, STORE.lng)
    svc.cancelMatching('d1')

    await jest.advanceTimersByTimeAsync(120_000)
    expect(push.send).not.toHaveBeenCalled()
  })

  it('não reoferta a quem já recebeu a oferta no ciclo anterior', async () => {
    jest.useFakeTimers()
    const { svc, prisma } = makeMatching()
    prisma.delivery.findUnique.mockResolvedValue(searching())
    prisma.courier.findMany.mockResolvedValue([courier('c1', 50)])

    await svc.startMatching('d1', STORE.lat, STORE.lng) // oferta a c1
    await jest.advanceTimersByTimeAsync(30_000)         // próximo raio

    // Na 2ª rodada, c1 entra na lista de excluídos da query.
    const lastWhere = prisma.courier.findMany.mock.calls.at(-1)![0].where
    expect(lastWhere.id.notIn).toContain('c1')
    svc.cancelMatching('d1')
  })
})
