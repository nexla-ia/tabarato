import { BadRequestException } from '@nestjs/common'
import { AccountDeletionService } from './account-deletion.service'

function makeService(user: any) {
  const tx: any = {
    user: { update: jest.fn().mockResolvedValue({ store: user.store ?? null, courier: user.courier ?? null }) },
    address: { updateMany: jest.fn(), deleteMany: jest.fn() },
    favorite: { deleteMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
    passwordReset: { deleteMany: jest.fn() },
    bibleRequest: { deleteMany: jest.fn() },
    ad: { updateMany: jest.fn() },
    store: { update: jest.fn() },
    courier: { update: jest.fn() },
  }
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue({ role: 'CONSUMER', deletedAt: null, store: null, courier: null, ...user }) },
    order: { count: jest.fn().mockResolvedValue(0) },
    delivery: { count: jest.fn().mockResolvedValue(0) },
    ad: { findFirst: jest.fn().mockResolvedValue(null) },
    wallet: { findUnique: jest.fn().mockResolvedValue(null) },
    withdrawal: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
  }
  return { svc: new AccountDeletionService(prisma), prisma, tx }
}

describe('AccountDeletionService', () => {
  it('cliente sem pendências: anonimiza, derruba sessões e apaga dados pessoais', async () => {
    const { svc, tx } = makeService({})
    await svc.excluir('u1')
    const data = tx.user.update.mock.calls[0][0].data
    expect(data).toMatchObject({ name: 'Conta excluída', phone: null, cpf: null, pushToken: null, appleSub: null, isActive: false })
    expect(data.email).toMatch(/^excluida-u1@/)
    expect(data.passwordChangedAt).toBeInstanceOf(Date) // invalida tokens já emitidos
    expect(tx.bibleRequest.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
    // Endereço usado em pedido é anonimizado (o pedido aponta para ele); o resto, apagado.
    expect(tx.address.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', orders: { some: {} } } }))
    expect(tx.address.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', orders: { none: {} } } })
  })

  it('pedido em andamento bloqueia, com o motivo escrito', async () => {
    const { svc, prisma, tx } = makeService({})
    prisma.order.count.mockResolvedValueOnce(1)
    await expect(svc.excluir('u1')).rejects.toThrow(/pedido em andamento/)
    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it('loja com saldo na carteira bloqueia até sacar', async () => {
    const { svc, prisma } = makeService({ role: 'STORE_OWNER', store: { id: 's1' } })
    prisma.wallet.findUnique.mockResolvedValue({ balance: 152.4 })
    const motivos = await svc.impedimentos('u1')
    expect(motivos.join(' ')).toMatch(/R\$\s?152,40 na carteira/)
  })

  it('entregador com entrega ativa bloqueia', async () => {
    const { svc, prisma } = makeService({ role: 'COURIER', courier: { id: 'c1' } })
    prisma.delivery.count.mockResolvedValue(1)
    expect((await svc.impedimentos('u1')).join(' ')).toMatch(/entrega em andamento/)
  })

  it('loja sem pendências sai do ar (dados ficam por obrigação legal)', async () => {
    const { svc, tx } = makeService({ role: 'STORE_OWNER', store: { id: 's1' } })
    await svc.excluir('u1')
    expect(tx.store.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { status: 'SUSPENDED', isOpen: false } })
  })

  it('administrador não se exclui pelo app', async () => {
    const { svc } = makeService({ role: 'ADMIN' })
    await expect(svc.excluir('u1')).rejects.toBeInstanceOf(BadRequestException)
  })
})
