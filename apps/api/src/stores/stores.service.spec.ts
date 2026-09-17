import { BadRequestException, ConflictException } from '@nestjs/common'
import { StoresService } from './stores.service'

// Service com dependências mockadas (unitário puro, sem DB).
function makeService(over: any = {}) {
  const prisma = {
    store: { findUnique: jest.fn(), update: jest.fn() },
    withdrawal: {
      create: jest.fn(), update: jest.fn(), delete: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]),
    },
    ...(over.prisma ?? {}),
  }
  const wallet = { debit: jest.fn(), credit: jest.fn(), findByOwner: jest.fn(), ...(over.wallet ?? {}) }
  const asaas = { enabled: false, moneyInEnabled: false, createPixTransfer: jest.fn(), getBalance: jest.fn(), createAccount: jest.fn(), ...(over.asaas ?? {}) }
  const mpOauth = {}
  const crypto = { encrypt: jest.fn((v: string) => `enc:${v}`), decrypt: jest.fn((v: string) => v), ...(over.crypto ?? {}) }

  const svc = new StoresService(prisma as any, wallet as any, mpOauth as any, asaas as any, crypto as any)
  return { svc, prisma, wallet, asaas, crypto }
}

describe('StoresService.requestWithdrawal', () => {
  it('exige chave PIX cadastrada (sem debitar)', async () => {
    const { svc, prisma, wallet } = makeService()
    prisma.store.findUnique.mockResolvedValue({ id: 's1', pixKey: null })
    await expect(svc.requestWithdrawal('u1', 50)).rejects.toBeInstanceOf(BadRequestException)
    expect(wallet.debit).not.toHaveBeenCalled()
  })

  it('bloqueia duplo-envio (saque em andamento recente)', async () => {
    const { svc, prisma, wallet } = makeService()
    prisma.store.findUnique.mockResolvedValue({ id: 's1', pixKey: 'chave' })
    prisma.withdrawal.findFirst.mockResolvedValue({ id: 'w0', status: 'PROCESSING' })
    await expect(svc.requestWithdrawal('u1', 50)).rejects.toBeInstanceOf(ConflictException)
    expect(wallet.debit).not.toHaveBeenCalled()
  })

  it('Asaas ligado + sucesso → debita, cria saque STORE e marca PROCESSING', async () => {
    const { svc, prisma, wallet, asaas } = makeService({
      asaas: { enabled: true, createPixTransfer: jest.fn().mockResolvedValue({ id: 'tr1', status: 'PENDING', authorized: true }) },
    })
    prisma.store.findUnique.mockResolvedValue({ id: 's1', pixKey: 'chave' })
    prisma.withdrawal.findFirst.mockResolvedValue(null)
    prisma.withdrawal.create.mockResolvedValue({ id: 'w1', ownerId: 's1', amount: 50 })
    prisma.withdrawal.update.mockResolvedValue({})

    await svc.requestWithdrawal('u1', 50)

    expect(prisma.withdrawal.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ownerType: 'STORE', ownerId: 's1' }) }),
    )
    expect(wallet.debit).toHaveBeenCalledWith('s1', 'STORE', 50, expect.any(String), 'saque-w1')
    expect(asaas.createPixTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ externalReference: 'w1', pixAddressKey: 'chave', value: 50 }),
    )
    expect(prisma.withdrawal.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'w1' }, data: expect.objectContaining({ status: 'PROCESSING', asaasTransferId: 'tr1' }) }),
    )
    expect(wallet.credit).not.toHaveBeenCalled()
  })

  it('Asaas ligado + falha → ESTORNA a carteira STORE, marca FAILED e lança erro', async () => {
    const { svc, prisma, wallet, asaas } = makeService({
      asaas: { enabled: true, createPixTransfer: jest.fn().mockRejectedValue(new Error('erro asaas')) },
    })
    prisma.store.findUnique.mockResolvedValue({ id: 's1', pixKey: 'chave' })
    prisma.withdrawal.findFirst.mockResolvedValue(null)
    prisma.withdrawal.create.mockResolvedValue({ id: 'w1', ownerId: 's1', amount: 50 })
    prisma.withdrawal.update.mockResolvedValue({})

    await expect(svc.requestWithdrawal('u1', 50)).rejects.toBeInstanceOf(BadRequestException)

    expect(wallet.credit).toHaveBeenCalledWith('s1', 'STORE', 50, expect.any(String), 'estorno-saque-w1')
    expect(prisma.withdrawal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    )
  })

  it('Asaas desligado → saque fica PENDING (fila manual), sem transferência', async () => {
    const { svc, prisma, wallet, asaas } = makeService({ asaas: { enabled: false } })
    prisma.store.findUnique.mockResolvedValue({ id: 's1', pixKey: 'chave' })
    prisma.withdrawal.findFirst.mockResolvedValue(null)
    prisma.withdrawal.create.mockResolvedValue({ id: 'w1', ownerId: 's1', amount: 50 })

    await svc.requestWithdrawal('u1', 50)

    expect(wallet.debit).toHaveBeenCalledWith('s1', 'STORE', 50, expect.any(String), 'saque-w1')
    expect(asaas.createPixTransfer).not.toHaveBeenCalled()
    expect(prisma.withdrawal.update).not.toHaveBeenCalled()
  })
})

describe('StoresService — split (subconta Asaas)', () => {
  it('saque no modo split → transfere da SUBCONTA (apiKey), sem debitar carteira', async () => {
    const { svc, prisma, wallet, asaas } = makeService({
      asaas: { enabled: true, createPixTransfer: jest.fn().mockResolvedValue({ id: 'tr1' }) },
    })
    prisma.store.findUnique.mockResolvedValue({ id: 's1', pixKey: 'chave', asaasWalletId: 'wal1', asaasApiKey: 'enc:KEY' })
    prisma.withdrawal.findFirst.mockResolvedValue(null)
    prisma.withdrawal.create.mockResolvedValue({ id: 'sw1' })
    prisma.withdrawal.update.mockResolvedValue({})

    await svc.requestWithdrawal('u1', 30)

    expect(wallet.debit).not.toHaveBeenCalled() // não mexe na carteira da plataforma
    expect(asaas.createPixTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ externalReference: 'sw1', pixAddressKey: 'chave', apiKey: expect.any(String) }),
    )
  })

  it('findWallet no modo split → saldo vem da subconta', async () => {
    const { svc, prisma, asaas } = makeService({ asaas: { getBalance: jest.fn().mockResolvedValue(42) } })
    prisma.store.findUnique.mockResolvedValue({ id: 's1', pixKey: 'k', asaasWalletId: 'wal1', asaasApiKey: 'enc:KEY' })

    const res: any = await svc.findWallet('u1')
    expect(res.balance).toBe(42)
    expect(res.source).toBe('ASAAS')
    expect(asaas.getBalance).toHaveBeenCalled()
  })

  it('onboarding cria a subconta e guarda a apiKey CRIPTOGRAFADA', async () => {
    const { svc, prisma, asaas, crypto } = makeService({
      asaas: { createAccount: jest.fn().mockResolvedValue({ id: 'acc1', walletId: 'wal1', apiKey: 'RAWKEY' }) },
    })
    prisma.store.findUnique.mockResolvedValue({ id: 's1', cnpj: '11222333000144', name: 'Loja', phone: '6699999', address: 'Rua X', asaasWalletId: null, user: { email: 'a@b.c' } })
    prisma.store.update = jest.fn().mockResolvedValue({})

    await svc.createAsaasAccount('u1', { postalCode: '76980000', addressNumber: '10', province: 'Centro', incomeValue: 5000 } as any)

    expect(asaas.createAccount).toHaveBeenCalledWith(expect.objectContaining({ cpfCnpj: '11222333000144', email: expect.stringContaining('+loja'), name: 'Loja' }))
    expect(crypto.encrypt).toHaveBeenCalledWith('RAWKEY')
    expect(prisma.store.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ asaasWalletId: 'wal1', asaasApiKey: 'enc:RAWKEY', asaasOnboarded: true }) }),
    )
  })
})

describe('StoresService.findWallet', () => {
  it('esconde o par saque/estorno de um saque falhado', async () => {
    const { svc, prisma, wallet } = makeService()
    prisma.store.findUnique.mockResolvedValue({ id: 's1', pixKey: 'chave' })
    wallet.findByOwner.mockResolvedValue({
      balance: 100,
      transactions: [
        { referenceId: 'credito-entrega-1' },
        { referenceId: 'saque-w1' },
        { referenceId: 'estorno-saque-w1' },
        { referenceId: 'saque-w2' }, // saque concluído (sem estorno) → aparece
      ],
    })
    const res = await svc.findWallet('u1')
    const refs = res.transactions.map((t: any) => t.referenceId)
    expect(refs).toEqual(['credito-entrega-1', 'saque-w2'])
    expect(res.pixKey).toBe('chave')
  })
})
