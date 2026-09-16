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
  const svc = new PaymentsService(
    config as any, prisma as any, push as any, notifications as any, {} as any, asaas as any, orderConsumption as any,
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
