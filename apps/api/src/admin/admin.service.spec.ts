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
  const svc = new AdminService(prisma as any, uploads as any, settings as any, matching as any)
  return { svc, prisma, uploads, matching, settings }
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
})
