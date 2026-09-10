import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { CouriersService } from './couriers.service'

// Constrói o service com todas as dependências mockadas (teste unitário puro, sem DB).
function makeService(over: any = {}) {
  const prisma = {
    courier: { findUnique: jest.fn(), update: jest.fn() },
    withdrawal: {
      create: jest.fn(), update: jest.fn(), updateMany: jest.fn(),
      findUnique: jest.fn(), findFirst: jest.fn(),
    },
    delivery: {
      findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(),
      count: jest.fn(), updateMany: jest.fn(),
    },
    order: { updateMany: jest.fn(), findUnique: jest.fn() },
    ...(over.prisma ?? {}),
  }
  const wallet = { debit: jest.fn(), credit: jest.fn(), ...(over.wallet ?? {}) }
  const asaas = { enabled: false, createPixTransfer: jest.fn(), ...(over.asaas ?? {}) }
  const uploads = { signDocuments: jest.fn().mockResolvedValue({}), ...(over.uploads ?? {}) }
  const matching = { cancelMatching: jest.fn(), startMatching: jest.fn().mockResolvedValue(undefined), ...(over.matching ?? {}) }
  const gateway = { evictUserFromOrder: jest.fn().mockResolvedValue(undefined), ...(over.gateway ?? {}) }
  const settings = { commissionFor: jest.fn().mockResolvedValue(0), courierFeeFor: jest.fn().mockResolvedValue(0), get: jest.fn(), ...(over.settings ?? {}) }
  const config = { get: jest.fn() }

  const svc = new CouriersService(
    prisma as any, {} as any, wallet as any, {} as any, {} as any,
    config as any, {} as any, asaas as any, uploads as any, settings as any, matching as any, gateway as any,
  )
  return { svc, prisma, wallet, asaas, uploads, matching, gateway, settings }
}

describe('CouriersService.requestWithdrawal', () => {
  it('bloqueia saque de entregador suspenso (sem debitar)', async () => {
    const { svc, prisma, wallet } = makeService()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1', status: 'SUSPENDED', pixKey: 'k' })
    await expect(svc.requestWithdrawal('u1', 50)).rejects.toBeInstanceOf(ForbiddenException)
    expect(wallet.debit).not.toHaveBeenCalled()
  })

  it('exige chave PIX cadastrada', async () => {
    const { svc, prisma } = makeService()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1', status: 'APPROVED', pixKey: null })
    await expect(svc.requestWithdrawal('u1', 50)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('Asaas ligado + sucesso → debita, cria saque e marca PROCESSING', async () => {
    const { svc, prisma, wallet, asaas } = makeService({
      asaas: { enabled: true, createPixTransfer: jest.fn().mockResolvedValue({ id: 'tr1', status: 'PENDING', authorized: true }) },
    })
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1', status: 'APPROVED', pixKey: 'chave', pixKeyType: 'CPF' })
    prisma.withdrawal.create.mockResolvedValue({ id: 'w1', courierId: 'c1', amount: 50 })
    prisma.withdrawal.update.mockResolvedValue({})

    await svc.requestWithdrawal('u1', 50)

    expect(wallet.debit).toHaveBeenCalled()
    expect(asaas.createPixTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ externalReference: 'w1', pixAddressKey: 'chave', pixAddressKeyType: 'CPF', value: 50 }),
    )
    expect(prisma.withdrawal.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'w1' }, data: expect.objectContaining({ status: 'PROCESSING', asaasTransferId: 'tr1' }) }),
    )
    expect(wallet.credit).not.toHaveBeenCalled()
  })

  it('Asaas ligado + falha → ESTORNA a carteira, marca FAILED e lança erro', async () => {
    const { svc, prisma, wallet, asaas } = makeService({
      asaas: { enabled: true, createPixTransfer: jest.fn().mockRejectedValue(new Error('saldo insuficiente')) },
    })
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1', status: 'APPROVED', pixKey: 'chave', pixKeyType: 'CPF' })
    prisma.withdrawal.create.mockResolvedValue({ id: 'w1', courierId: 'c1', amount: 50 })
    prisma.withdrawal.update.mockResolvedValue({})

    await expect(svc.requestWithdrawal('u1', 50)).rejects.toBeInstanceOf(BadRequestException)

    expect(wallet.credit).toHaveBeenCalledWith('c1', 'COURIER', 50, expect.any(String), expect.stringContaining('estorno-'))
    expect(prisma.withdrawal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    )
  })

  it('Asaas desligado → saque fica PENDING (fila manual), sem chamar transferência', async () => {
    const { svc, prisma, wallet, asaas } = makeService({ asaas: { enabled: false } })
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1', status: 'APPROVED', pixKey: 'chave' })
    prisma.withdrawal.create.mockResolvedValue({ id: 'w1', courierId: 'c1', amount: 50 })

    await svc.requestWithdrawal('u1', 50)

    expect(wallet.debit).toHaveBeenCalled()
    expect(asaas.createPixTransfer).not.toHaveBeenCalled()
    expect(prisma.withdrawal.update).not.toHaveBeenCalled()
  })
})

describe('CouriersService.handleAsaasTransferWebhook', () => {
  it('TRANSFER_DONE → marca DONE, sem estorno', async () => {
    const { svc, prisma, wallet } = makeService()
    prisma.withdrawal.findUnique.mockResolvedValue({ id: 'w1', courierId: 'c1', amount: 50, status: 'PROCESSING' })
    prisma.withdrawal.updateMany.mockResolvedValue({ count: 1 })

    await svc.handleAsaasTransferWebhook('TRANSFER_DONE', { externalReference: 'w1' })

    expect(prisma.withdrawal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'w1', status: 'PROCESSING' }, data: { status: 'DONE' } }),
    )
    expect(wallet.credit).not.toHaveBeenCalled()
  })

  it('TRANSFER_FAILED (transição efetivada) → estorna a carteira', async () => {
    const { svc, prisma, wallet } = makeService()
    prisma.withdrawal.findUnique.mockResolvedValue({ id: 'w1', courierId: 'c1', amount: 50, status: 'PROCESSING' })
    prisma.withdrawal.updateMany.mockResolvedValue({ count: 1 })

    await svc.handleAsaasTransferWebhook('TRANSFER_FAILED', { externalReference: 'w1', failReason: 'x' })

    expect(wallet.credit).toHaveBeenCalledWith('c1', 'COURIER', 50, expect.any(String), 'estorno-w1')
  })

  it('TRANSFER_FAILED idempotente (count=0) → NÃO estorna de novo', async () => {
    const { svc, prisma, wallet } = makeService()
    prisma.withdrawal.findUnique.mockResolvedValue({ id: 'w1', courierId: 'c1', amount: 50, status: 'FAILED' })
    prisma.withdrawal.updateMany.mockResolvedValue({ count: 0 })

    await svc.handleAsaasTransferWebhook('TRANSFER_FAILED', { externalReference: 'w1' })

    expect(wallet.credit).not.toHaveBeenCalled()
  })

  it('saque inexistente → no-op', async () => {
    const { svc, prisma } = makeService()
    prisma.withdrawal.findUnique.mockResolvedValue(null)
    await svc.handleAsaasTransferWebhook('TRANSFER_DONE', { externalReference: 'nao-existe' })
    expect(prisma.withdrawal.updateMany).not.toHaveBeenCalled()
  })
})

describe('CouriersService.resubmitDocument', () => {
  it('recusa reenvio se a conta já está APPROVED', async () => {
    const { svc, prisma } = makeService()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1', status: 'APPROVED' })
    await expect(svc.resubmitDocument('u1', 'cnh', 'path')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('reenvio zera o status do doc e volta a conta pra PENDING', async () => {
    const { svc, prisma, uploads } = makeService()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1', status: 'REJECTED' })
    prisma.courier.update.mockResolvedValue({ id: 'c1', cnhPhotoUrl: 'newpath' })

    await svc.resubmitDocument('u1', 'cnh', 'newpath')

    expect(prisma.courier.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ status: 'PENDING', cnhPhotoUrl: 'newpath', cnhStatus: null }),
      }),
    )
    expect(uploads.signDocuments).toHaveBeenCalled()
  })
})

describe('CouriersService.findAvailableDeliveries (guardas de PII)', () => {
  it('não-APROVADO → lista vazia (não enumera endereços)', async () => {
    const { svc, prisma } = makeService()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1', status: 'PENDING', isOnline: true, currentLat: 1, currentLng: 1 })
    expect(await svc.findAvailableDeliveries('u1')).toEqual([])
    expect(prisma.delivery.findMany).not.toHaveBeenCalled()
  })
  it('offline → lista vazia', async () => {
    const { svc, prisma } = makeService()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1', status: 'APPROVED', isOnline: false, currentLat: 1, currentLng: 1 })
    expect(await svc.findAvailableDeliveries('u1')).toEqual([])
  })
  it('sem localização → lista vazia', async () => {
    const { svc, prisma } = makeService()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1', status: 'APPROVED', isOnline: true, currentLat: null, currentLng: null })
    expect(await svc.findAvailableDeliveries('u1')).toEqual([])
  })
})

describe('CouriersService.acceptDelivery', () => {
  const approved = { id: 'c1', status: 'APPROVED', isOnline: true, currentLat: -12.7, currentLng: -60.1 }

  it('recusa entregador não aprovado', async () => {
    const { svc, prisma } = makeService()
    prisma.courier.findUnique.mockResolvedValue({ ...approved, status: 'SUSPENDED' })
    await expect(svc.acceptDelivery('u1', 'd1')).rejects.toBeInstanceOf(ForbiddenException)
  })
  it('recusa offline', async () => {
    const { svc, prisma } = makeService()
    prisma.courier.findUnique.mockResolvedValue({ ...approved, isOnline: false })
    await expect(svc.acceptDelivery('u1', 'd1')).rejects.toBeInstanceOf(ForbiddenException)
  })
  it('recusa sem localização', async () => {
    const { svc, prisma } = makeService()
    prisma.courier.findUnique.mockResolvedValue({ ...approved, currentLat: null, currentLng: null })
    await expect(svc.acceptDelivery('u1', 'd1')).rejects.toBeInstanceOf(ForbiddenException)
  })
  it('pré-checagem: já tem entrega ativa → Conflict', async () => {
    const { svc, prisma } = makeService()
    prisma.courier.findUnique.mockResolvedValue(approved)
    prisma.delivery.count.mockResolvedValueOnce(1) // activeCount
    await expect(svc.acceptDelivery('u1', 'd1')).rejects.toBeInstanceOf(ConflictException)
  })
  it('claim perdido (count=0) → Conflict', async () => {
    const { svc, prisma } = makeService()
    prisma.courier.findUnique.mockResolvedValue(approved)
    prisma.delivery.count.mockResolvedValueOnce(0)
    prisma.delivery.findUnique.mockResolvedValueOnce({ id: 'd1', courierId: null, status: 'SEARCHING_COURIER', order: { store: { lat: -12.7, lng: -60.1 } } })
    prisma.delivery.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(svc.acceptDelivery('u1', 'd1')).rejects.toBeInstanceOf(ConflictException)
  })
  it('claim-then-verify: acabou com 2 ativas → devolve ao pool e recusa', async () => {
    const { svc, prisma, matching } = makeService()
    prisma.courier.findUnique.mockResolvedValue(approved)
    prisma.delivery.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2) // pré=0, pós=2
    prisma.delivery.findUnique.mockResolvedValueOnce({ id: 'd1', courierId: null, status: 'SEARCHING_COURIER', order: { store: { lat: -12.7, lng: -60.1 } } })
    prisma.delivery.updateMany.mockResolvedValueOnce({ count: 1 }) // claim
      .mockResolvedValueOnce({ count: 1 }) // release
    await expect(svc.acceptDelivery('u1', 'd1')).rejects.toBeInstanceOf(ConflictException)
    // 2ª chamada de updateMany = devolução ao pool
    expect(prisma.delivery.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { courierId: null, status: 'SEARCHING_COURIER' } }),
    )
    expect(matching.cancelMatching).not.toHaveBeenCalled()
  })
  it('caminho feliz: 1 ativa → cancela matching e retorna', async () => {
    const { svc, prisma, matching } = makeService()
    prisma.courier.findUnique.mockResolvedValue(approved)
    prisma.delivery.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1)
    prisma.delivery.findUnique
      .mockResolvedValueOnce({ id: 'd1', courierId: null, status: 'SEARCHING_COURIER', order: { store: { lat: -12.7, lng: -60.1 } } })
      .mockResolvedValueOnce({ id: 'd1', status: 'COURIER_HEADING_TO_STORE' })
    prisma.delivery.updateMany.mockResolvedValueOnce({ count: 1 })
    const r = await svc.acceptDelivery('u1', 'd1')
    expect(matching.cancelMatching).toHaveBeenCalledWith('d1')
    expect(r).toEqual({ id: 'd1', status: 'COURIER_HEADING_TO_STORE' })
  })
})

describe('CouriersService.returnDelivery', () => {
  it('status não devolvível (já coletou) → BadRequest', async () => {
    const { svc, prisma } = makeService()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1' })
    prisma.delivery.findFirst.mockResolvedValue({ id: 'd1', courierId: 'c1', orderId: 'o1', status: 'PICKED_UP' })
    await expect(svc.returnDelivery('u1', 'd1')).rejects.toBeInstanceOf(BadRequestException)
  })
  it('devolução atômica perdida (status mudou) → Conflict', async () => {
    const { svc, prisma } = makeService()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1' })
    prisma.delivery.findFirst.mockResolvedValue({ id: 'd1', courierId: 'c1', orderId: 'o1', status: 'COURIER_AT_STORE' })
    prisma.delivery.updateMany.mockResolvedValue({ count: 0 })
    await expect(svc.returnDelivery('u1', 'd1')).rejects.toBeInstanceOf(ConflictException)
  })
  it('caminho feliz: updateMany com guarda de status + evict + re-match', async () => {
    const { svc, prisma, gateway, matching } = makeService()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1' })
    prisma.delivery.findFirst.mockResolvedValue({ id: 'd1', courierId: 'c1', orderId: 'o1', status: 'COURIER_AT_STORE' })
    prisma.delivery.updateMany.mockResolvedValue({ count: 1 })
    prisma.order.findUnique.mockResolvedValue({ store: { lat: -12.7, lng: -60.1 } })
    prisma.delivery.findUnique.mockResolvedValue({ id: 'd1', status: 'SEARCHING_COURIER' })
    await svc.returnDelivery('u1', 'd1')
    expect(prisma.delivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'd1', courierId: 'c1', status: { in: ['COURIER_HEADING_TO_STORE', 'COURIER_AT_STORE'] } }) }),
    )
    expect(gateway.evictUserFromOrder).toHaveBeenCalledWith('o1', 'u1')
    expect(matching.startMatching).toHaveBeenCalled()
  })
})

describe('CouriersService.advanceDelivery (código de entrega anti-fraude)', () => {
  function pickedUp(deliveryCode: string | null) {
    return {
      id: 'd1', courierId: 'c1', status: 'PICKED_UP',
      orderId: 'o1', order: { deliveryCode, address: { lat: null, lng: null } },
    }
  }
  it('transição inválida (status final) → BadRequest', async () => {
    const { svc, prisma } = makeService()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1' })
    prisma.delivery.findFirst.mockResolvedValue({ id: 'd1', courierId: 'c1', status: 'DELIVERED', orderId: 'o1', order: {} })
    await expect(svc.advanceDelivery('u1', 'd1')).rejects.toBeInstanceOf(BadRequestException)
  })
  it('finalizar sem código → pede o código', async () => {
    const { svc, prisma } = makeService()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1' })
    prisma.delivery.findFirst.mockResolvedValue(pickedUp('123456'))
    await expect(svc.advanceDelivery('u1', 'd1', undefined, undefined)).rejects.toThrow('Informe o código')
    expect(prisma.order.updateMany).not.toHaveBeenCalled()
  })
  it('código errado → incrementa tentativa ATOMICAMENTE (lt:5) e recusa', async () => {
    const { svc, prisma } = makeService()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1' })
    prisma.delivery.findFirst.mockResolvedValue(pickedUp('123456'))
    prisma.order.updateMany.mockResolvedValue({ count: 1 })
    prisma.order.findUnique.mockResolvedValue({ deliveryCodeAttempts: 1 })
    await expect(svc.advanceDelivery('u1', 'd1', undefined, '000000')).rejects.toThrow('incorreto')
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'o1', deliveryCodeAttempts: { lt: 5 } }, data: { deliveryCodeAttempts: { increment: 1 } } }),
    )
  })
  it('lockout: já estourou 5 tentativas (updateMany count=0) → bloqueia', async () => {
    const { svc, prisma } = makeService()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1' })
    prisma.delivery.findFirst.mockResolvedValue(pickedUp('123456'))
    prisma.order.updateMany.mockResolvedValue({ count: 0 })
    await expect(svc.advanceDelivery('u1', 'd1', undefined, '000000')).rejects.toThrow('Muitas tentativas')
  })
})

describe('CouriersService.getStats (ganho do dia)', () => {
  it('conta só entregas de pedido PAGO', async () => {
    const { svc, prisma } = makeService()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1', rating: 4.8 })
    prisma.delivery.findMany.mockResolvedValue([{ courierFee: 6 }, { courierFee: 4 }])
    const r = await svc.getStats('u1')
    expect(prisma.delivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'DELIVERED', order: { payment: { status: 'PAID' } } }) }),
    )
    expect(r).toEqual({ todayCount: 2, todayEarnings: 10, rating: 4.8 })
  })
})
