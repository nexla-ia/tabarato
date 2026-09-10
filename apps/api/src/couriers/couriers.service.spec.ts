import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { CouriersService } from './couriers.service'

// Constrói o service com todas as dependências mockadas (teste unitário puro, sem DB).
function makeService(over: any = {}) {
  const prisma = {
    courier: { findUnique: jest.fn(), update: jest.fn() },
    withdrawal: {
      create: jest.fn(), update: jest.fn(), updateMany: jest.fn(),
      findUnique: jest.fn(), findFirst: jest.fn(),
    },
    ...(over.prisma ?? {}),
  }
  const wallet = { debit: jest.fn(), credit: jest.fn(), ...(over.wallet ?? {}) }
  const asaas = { enabled: false, createPixTransfer: jest.fn(), ...(over.asaas ?? {}) }
  const uploads = { signDocuments: jest.fn().mockResolvedValue({}), ...(over.uploads ?? {}) }
  const config = { get: jest.fn() }

  const svc = new CouriersService(
    prisma as any, {} as any, wallet as any, {} as any, {} as any,
    config as any, {} as any, asaas as any, uploads as any, undefined as any, undefined as any,
  )
  return { svc, prisma, wallet, asaas, uploads }
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
