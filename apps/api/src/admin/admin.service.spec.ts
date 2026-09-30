import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { AdminService } from './admin.service'

function makeAdmin(over: any = {}) {
  const prisma = {
    courier: { findUnique: jest.fn(), update: jest.fn() },
    delivery: { count: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
    ...(over.prisma ?? {}),
  }
  const uploads = { signDocuments: jest.fn().mockResolvedValue({}) }
  const matching = { cancelMatching: jest.fn() }
  const settings = { get: jest.fn(), update: jest.fn() }
  const notifications = { create: jest.fn().mockResolvedValue(undefined) }
  const push = { send: jest.fn().mockResolvedValue(undefined) }
  const svc = new AdminService(prisma as any, uploads as any, settings as any, notifications as any, push as any, matching as any)
  return { svc, prisma, uploads, matching, settings, notifications, push }
}

describe('AdminService.assignDelivery', () => {
  it('sem courierId → BadRequest', async () => {
    const { svc } = makeAdmin()
    await expect(svc.assignDelivery('d1', '')).rejects.toBeInstanceOf(BadRequestException)
  })
  it('entregador inexistente → NotFound', async () => {
    const { svc, prisma } = makeAdmin()
    prisma.courier.findUnique.mockResolvedValue(null)
    await expect(svc.assignDelivery('d1', 'c1')).rejects.toBeInstanceOf(NotFoundException)
  })
  it('entregador não aprovado → BadRequest', async () => {
    const { svc, prisma } = makeAdmin()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1', status: 'PENDING' })
    await expect(svc.assignDelivery('d1', 'c1')).rejects.toBeInstanceOf(BadRequestException)
  })
  it('entregador já ocupado → Conflict', async () => {
    const { svc, prisma } = makeAdmin()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1', status: 'APPROVED' })
    prisma.delivery.count.mockResolvedValue(1)
    await expect(svc.assignDelivery('d1', 'c1')).rejects.toBeInstanceOf(ConflictException)
  })
  it('pedido não mais aguardando (claim=0) → Conflict', async () => {
    const { svc, prisma } = makeAdmin()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1', status: 'APPROVED' })
    prisma.delivery.count.mockResolvedValue(0)
    prisma.delivery.updateMany.mockResolvedValue({ count: 0 })
    await expect(svc.assignDelivery('d1', 'c1')).rejects.toBeInstanceOf(ConflictException)
  })
  it('caminho feliz: claim atômico + cancela matching', async () => {
    const { svc, prisma, matching } = makeAdmin()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1', status: 'APPROVED' })
    prisma.delivery.count.mockResolvedValue(0)
    prisma.delivery.updateMany.mockResolvedValue({ count: 1 })
    prisma.delivery.findUnique.mockResolvedValue({ id: 'd1', status: 'COURIER_HEADING_TO_STORE' })
    const r = await svc.assignDelivery('d1', 'c1')
    expect(prisma.delivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'd1', status: 'SEARCHING_COURIER', courierId: null }) }),
    )
    expect(matching.cancelMatching).toHaveBeenCalledWith('d1')
    expect(r).toEqual({ id: 'd1', status: 'COURIER_HEADING_TO_STORE' })
  })
})

describe('AdminService.updateCourierDocStatus (auto-aprovação)', () => {
  const dto = (document: any, status: any) => ({ document, status })

  it('reprovar 1 doc → conta vai a REJECTED', async () => {
    const { svc, prisma } = makeAdmin()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1' })
    prisma.courier.update
      .mockResolvedValueOnce({ id: 'c1', cnhStatus: 'REJECTED', identityStatus: 'APPROVED', vehicleDocStatus: 'APPROVED' })
      .mockResolvedValueOnce({ id: 'c1', status: 'REJECTED' })
    await svc.updateCourierDocStatus('c1', dto('cnh', 'REJECTED'))
    expect(prisma.courier.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { status: 'REJECTED' } }),
    )
  })

  it('todos os 3 docs aprovados → conta vai a APPROVED', async () => {
    const { svc, prisma } = makeAdmin()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1' })
    prisma.courier.update
      .mockResolvedValueOnce({ id: 'c1', cnhStatus: 'APPROVED', identityStatus: 'APPROVED', vehicleDocStatus: 'APPROVED' })
      .mockResolvedValueOnce({ id: 'c1', status: 'APPROVED' })
    await svc.updateCourierDocStatus('c1', dto('vehicle', 'APPROVED'))
    expect(prisma.courier.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { status: 'APPROVED' } }),
    )
  })

  it('aprovação parcial (falta doc) → NÃO muda o status geral (1 só update)', async () => {
    const { svc, prisma } = makeAdmin()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1' })
    prisma.courier.update.mockResolvedValueOnce({ id: 'c1', cnhStatus: 'APPROVED', identityStatus: null, vehicleDocStatus: null })
    await svc.updateCourierDocStatus('c1', dto('cnh', 'APPROVED'))
    expect(prisma.courier.update).toHaveBeenCalledTimes(1)
  })

  it('todos aprovados → AVISA o entregador que o cadastro foi aprovado', async () => {
    const { svc, prisma, push, notifications } = makeAdmin()
    prisma.courier.findUnique.mockResolvedValue({ id: 'c1', status: 'PENDING' })
    prisma.courier.update
      .mockResolvedValueOnce({ id: 'c1', cnhStatus: 'APPROVED', identityStatus: 'APPROVED', vehicleDocStatus: 'APPROVED' })
      .mockResolvedValueOnce({ id: 'c1', status: 'APPROVED', user: { id: 'u1', pushToken: 'tok' } })
    await svc.updateCourierDocStatus('c1', dto('vehicle', 'APPROVED'))
    expect(push.send).toHaveBeenCalledWith('tok', expect.stringContaining('aprovado'), expect.any(String), { screen: 'courier' })
    expect(notifications.create).toHaveBeenCalledWith('u1', 'SYSTEM', expect.any(String), expect.any(String), expect.objectContaining({ status: 'APPROVED' }))
  })
})

describe('AdminService.updateCourierStatus (avisos de cadastro)', () => {
  function setup(currentStatus: string) {
    const ctx = makeAdmin()
    ctx.prisma.courier.findUnique.mockResolvedValue({ id: 'c1', status: currentStatus })
    ctx.prisma.courier.update.mockImplementation(async ({ data }: any) =>
      ({ id: 'c1', status: data.status, user: { id: 'u1', pushToken: 'tok' } }))
    return ctx
  }

  it('aprovar → push + notificação pro entregador', async () => {
    const { svc, push, notifications } = setup('PENDING')
    await svc.updateCourierStatus('c1', { status: 'APPROVED' } as any)
    expect(push.send).toHaveBeenCalledWith('tok', expect.stringContaining('aprovado'), expect.any(String), { screen: 'courier' })
    expect(notifications.create).toHaveBeenCalled()
  })

  it('suspender → avisa que a conta foi suspensa', async () => {
    const { svc, push } = setup('APPROVED')
    await svc.updateCourierStatus('c1', { status: 'SUSPENDED' } as any)
    expect(push.send).toHaveBeenCalledWith('tok', expect.stringContaining('suspensa'), expect.any(String), { screen: 'courier' })
  })

  it('status inalterado → NÃO reenvia aviso', async () => {
    const { svc, push, notifications } = setup('APPROVED')
    await svc.updateCourierStatus('c1', { status: 'APPROVED' } as any)
    expect(push.send).not.toHaveBeenCalled()
    expect(notifications.create).not.toHaveBeenCalled()
  })

  it('entregador sem pushToken → não quebra, só grava a notificação', async () => {
    const ctx = makeAdmin()
    ctx.prisma.courier.findUnique.mockResolvedValue({ id: 'c1', status: 'PENDING' })
    ctx.prisma.courier.update.mockResolvedValue({ id: 'c1', status: 'APPROVED', user: { id: 'u1', pushToken: null } })
    await ctx.svc.updateCourierStatus('c1', { status: 'APPROVED' } as any)
    expect(ctx.push.send).not.toHaveBeenCalled()
    expect(ctx.notifications.create).toHaveBeenCalledWith('u1', 'SYSTEM', expect.any(String), expect.any(String), expect.any(Object))
  })
})

describe('AdminService.assignDelivery (aviso da atribuição manual)', () => {
  it('atribuiu → avisa o entregador com orderId + type (push navegável)', async () => {
    const { svc, prisma, push, notifications } = makeAdmin()
    prisma.courier.findUnique
      .mockResolvedValueOnce({ id: 'c1', status: 'APPROVED' })          // validação
      .mockResolvedValueOnce({ userId: 'u1', user: { pushToken: 'tok' } }) // p/ notificar
    prisma.delivery.count.mockResolvedValue(0)
    prisma.delivery.updateMany.mockResolvedValue({ count: 1 })
    prisma.delivery.findUnique.mockResolvedValue({ id: 'd1', orderId: 'o1', status: 'COURIER_HEADING_TO_STORE' })

    await svc.assignDelivery('d1', 'c1')

    expect(push.send).toHaveBeenCalledWith(
      'tok', expect.stringContaining('atribuída'), expect.any(String),
      { orderId: 'o1', type: 'NEW_DELIVERY' },
    )
    expect(notifications.create).toHaveBeenCalledWith(
      'u1', 'DELIVERY_UPDATE', expect.any(String), expect.any(String), { orderId: 'o1' },
    )
  })
})
