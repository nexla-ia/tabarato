import { PaymentsService } from './payments.service'

// Foco: handleAsaasWebhook NÃO pode confiar no corpo do evento — tem que re-consultar
// o Asaas e conferir status/valor/gateway antes de confirmar o pedido (fix C1).
function makeService(over: any = {}) {
  const prisma = {
    order: { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    payment: { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    ...(over.prisma ?? {}),
  }
  const push = { send: jest.fn() }
  const notifications = { create: jest.fn().mockResolvedValue(undefined) }
  const orderConsumption = { cancelPendingForPayment: jest.fn().mockResolvedValue(undefined) }
  const asaas = {
    isWebhookAuthorized: jest.fn().mockReturnValue(true),
    getPayment: jest.fn(),
    getCheckout: jest.fn(),
    ...(over.asaas ?? {}),
  }
  const config = { get: jest.fn() }
  const settings = { get: jest.fn().mockResolvedValue({ maxDeliveryValue: 1000 }) }
  const svc = new PaymentsService(
    config as any, prisma as any, push as any, notifications as any, {} as any, asaas as any, orderConsumption as any, settings as any,
  )
  return { svc, prisma, push, notifications, asaas }
}

const pixOrder = (over: any = {}) => ({
  id: 'ord1', userId: 'u1',
  payment: { id: 'p1', status: 'PENDING', gateway: 'ASAAS', gatewayId: 'pay_1', method: 'PIX', amount: 50, ...over },
  user: { id: 'u1', pushToken: null },
})

describe('PaymentsService.handleAsaasWebhook (segurança C1)', () => {
  it('PAYMENT_CONFIRMED FORJADO mas Asaas diz PENDING → NÃO confirma', async () => {
    const { svc, prisma, asaas } = makeService({
      asaas: { getPayment: jest.fn().mockResolvedValue({ status: 'PENDING', value: 50 }) },
    })
    prisma.order.findUnique.mockResolvedValue(pixOrder())

    await svc.handleAsaasWebhook('tok', { event: 'PAYMENT_CONFIRMED', payment: { externalReference: 'ord1', id: 'pay_1' } })

    expect(asaas.getPayment).toHaveBeenCalledWith('pay_1')
    expect(prisma.payment.updateMany).not.toHaveBeenCalled() // não marcou PAID
  })

  it('valor divergente (paga menos) → NÃO confirma', async () => {
    const { svc, prisma } = makeService({
      asaas: { getPayment: jest.fn().mockResolvedValue({ status: 'RECEIVED', value: 5 }) }, // pagou 5, pedido é 50
    })
    prisma.order.findUnique.mockResolvedValue(pixOrder())

    await svc.handleAsaasWebhook('tok', { event: 'PAYMENT_CONFIRMED', payment: { externalReference: 'ord1' } })

    expect(prisma.payment.updateMany).not.toHaveBeenCalled()
  })

  it('pago de verdade + valor batendo → confirma o pedido', async () => {
    const { svc, prisma } = makeService({
      asaas: { getPayment: jest.fn().mockResolvedValue({ status: 'RECEIVED', value: 50 }) },
    })
    prisma.order.findUnique.mockResolvedValue(pixOrder())

    await svc.handleAsaasWebhook('tok', { event: 'PAYMENT_RECEIVED', payment: { externalReference: 'ord1' } })

    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }),
    )
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CONFIRMED' } }),
    )
  })

  it('pedido NÃO é do Asaas (gateway MP) → ignora (não re-consulta nem confirma)', async () => {
    const { svc, prisma, asaas } = makeService({
      asaas: { getPayment: jest.fn() },
    })
    prisma.order.findUnique.mockResolvedValue(pixOrder({ gateway: 'MP' }))

    await svc.handleAsaasWebhook('tok', { event: 'PAYMENT_CONFIRMED', payment: { externalReference: 'ord1' } })

    expect(asaas.getPayment).not.toHaveBeenCalled()
    expect(prisma.payment.updateMany).not.toHaveBeenCalled()
  })

  it('token inválido → nem processa', async () => {
    const { svc, prisma } = makeService({ asaas: { isWebhookAuthorized: jest.fn().mockReturnValue(false) } })
    await svc.handleAsaasWebhook('errado', { event: 'PAYMENT_CONFIRMED', payment: { externalReference: 'ord1' } })
    expect(prisma.order.findUnique).not.toHaveBeenCalled()
  })
})

// Cobrança de anúncio: mesmas travas do pedido (corpo do webhook é só gatilho).
describe('PaymentsService.settleAdPayment (anúncio)', () => {
  const adPayment = (over: any = {}) => ({ id: 'p9', status: 'PENDING', gateway: 'ASAAS', gatewayId: 'pay_9', amount: 70, ...over })

  function setup(asaasPayment: any, payment = adPayment()) {
    const { svc, prisma, asaas } = makeService({
      asaas: { getPayment: jest.fn().mockResolvedValue(asaasPayment) },
      prisma: {
        payment: {
          findUnique: jest.fn().mockResolvedValue(payment),
          findFirst: jest.fn().mockResolvedValue({ id: 'p9' }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      },
    })
    const handler = jest.fn().mockResolvedValue(undefined)
    svc.onAdPaid(handler)
    return { svc, prisma, asaas, handler }
  }

  it('webhook forjado (Asaas diz PENDING) → não ativa o anúncio', async () => {
    const { svc, handler, asaas } = setup({ status: 'PENDING', value: 70, externalReference: 'ad:a1' })
    await svc.handleAsaasWebhook('tok', { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_9', externalReference: 'ad:a1' } })
    expect(asaas.getPayment).toHaveBeenCalledWith('pay_9')
    expect(handler).not.toHaveBeenCalled()
  })

  it('pagou valor menor → não ativa', async () => {
    const { svc, handler } = setup({ status: 'RECEIVED', value: 7, externalReference: 'ad:a1' })
    expect(await svc.settleAdPayment('p9', 'a1')).toBe('PENDING')
    expect(handler).not.toHaveBeenCalled()
  })

  it('cobrança de OUTRO anúncio → não ativa este', async () => {
    const { svc, handler } = setup({ status: 'RECEIVED', value: 70, externalReference: 'ad:outro' })
    expect(await svc.settleAdPayment('p9', 'a1')).toBe('PENDING')
    expect(handler).not.toHaveBeenCalled()
  })

  it('pago de verdade → marca PAID e entrega ao AdsService uma vez só', async () => {
    const { svc, prisma, handler } = setup({ status: 'RECEIVED', value: 70, externalReference: 'ad:a1' })
    await svc.handleAsaasWebhook('tok', { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_9', externalReference: 'ad:a1' } })
    expect(handler).toHaveBeenCalledWith('a1', 'p9')

    prisma.payment.updateMany.mockResolvedValue({ count: 0 }) // retry do webhook: claim já foi
    await svc.settleAdPayment('p9', 'a1')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('aceita pagamento confirmado depois do cron ter marcado FAILED (pagou no limite)', async () => {
    const { svc, handler } = setup({ status: 'RECEIVED', value: 70, externalReference: 'ad:a1' }, adPayment({ status: 'FAILED' }))
    expect(await svc.settleAdPayment('p9', 'a1')).toBe('PAID')
    expect(handler).toHaveBeenCalled()
  })
})
