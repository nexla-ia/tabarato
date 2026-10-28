import { BadRequestException } from '@nestjs/common'
import { AdsService } from './ads.service'

const SUPA = 'https://x.supabase.co'
const ARTE = `${SUPA}/storage/v1/object/public/product-images/arte.png`

function makeService(over: any = {}) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    ad: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'a1', userId: 'u1', ...data })),
    },
  }
  const prisma: any = {
    ad: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'a1', status: 'PENDING_REVIEW', ...data })),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'a1', userId: 'u1', totalPrice: 70 }),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Ana', email: null, pushToken: null }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    store: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    ...(over.prisma ?? {}),
  }
  const payments = { onAdPaid: jest.fn(), settleAdPayment: jest.fn(), createAdPix: jest.fn() }
  const settings = { get: jest.fn().mockResolvedValue({ adPricePerDay: 10, adMinDays: 7, adSlots: 5, adPayDeadlineDays: 3 }) }
  const uploads = { uploadImageBuffer: jest.fn().mockResolvedValue(`${SUPA}/storage/v1/object/public/product-images/final.jpg`) }
  const notifications = { create: jest.fn().mockResolvedValue(undefined) }
  const push = { send: jest.fn().mockResolvedValue(undefined) }
  const mail = { send: jest.fn().mockResolvedValue(true) }
  const config = { get: jest.fn((k: string) => (k === 'SUPABASE_URL' ? SUPA : undefined)) }
  const svc = new AdsService(prisma, payments as any, settings as any, uploads as any,
    notifications as any, push as any, mail as any, config as any)
  return { svc, prisma, tx, payments, notifications }
}

const pedido = (over: any = {}) => ({
  companyName: 'Padaria Sol', document: '11.222.333/0001-81', imageUrl: ARTE, days: 7, ...over,
})

describe('AdsService.create', () => {
  it('recusa menos dias que o mínimo do admin', async () => {
    const { svc } = makeService()
    await expect(svc.create('u1', pedido({ days: 3 }))).rejects.toThrow(/entre 7 e 90/)
  })

  it('recusa CNPJ com dígito verificador errado', async () => {
    const { svc } = makeService()
    await expect(svc.create('u1', pedido({ document: '11.222.333/0001-80' }))).rejects.toThrow(/CPF ou CNPJ/)
  })

  it('recusa arte que não veio do nosso bucket', async () => {
    const { svc } = makeService()
    await expect(svc.create('u1', pedido({ imageUrl: 'https://evil.com/a.png' }))).rejects.toBeInstanceOf(BadRequestException)
  })

  it('link para loja só se a pessoa tiver loja', async () => {
    const { svc } = makeService()
    await expect(svc.create('u1', pedido({ linkType: 'STORE' }))).rejects.toThrow(/não tem loja/)
  })

  it('WhatsApp e link exigem formato válido', async () => {
    const { svc } = makeService()
    await expect(svc.create('u1', pedido({ linkType: 'WHATSAPP', linkTarget: '1234' }))).rejects.toThrow(/WhatsApp/)
    await expect(svc.create('u1', pedido({ linkType: 'URL', linkTarget: 'http://site.com' }))).rejects.toThrow(/https/)
  })
})

describe('AdsService.ativarPago', () => {
  it('anúncio aguardando pagamento entra no ar agora se há vaga', async () => {
    const { svc, tx } = makeService()
    tx.ad.findUnique.mockResolvedValue({ id: 'a1', userId: 'u1', status: 'AWAITING_PAYMENT', days: 7 })
    await svc.ativarPago('a1', 'p1')
    const data = tx.ad.update.mock.calls[0][0].data
    expect(data.status).toBe('PAID')
    expect(data.endsAt.getTime() - data.startsAt.getTime()).toBe(7 * 24 * 3600 * 1000)
    expect(data.liveNotified).toBe(true)
    expect(tx.$executeRaw).toHaveBeenCalled() // trava de agenda
  })

  it('vitrine lotada: agenda para quando abrir vaga e não marca "no ar"', async () => {
    const { svc, tx } = makeService()
    const fim = new Date(Date.now() + 2 * 24 * 3600 * 1000)
    tx.ad.findUnique.mockResolvedValue({ id: 'a1', userId: 'u1', status: 'AWAITING_PAYMENT', days: 7 })
    tx.ad.findMany.mockResolvedValue(Array.from({ length: 5 }, () => ({ startsAt: new Date(Date.now() - 1000), endsAt: fim })))
    await svc.ativarPago('a1', 'p1')
    const data = tx.ad.update.mock.calls[0][0].data
    expect(data.startsAt).toEqual(fim)
    expect(data.liveNotified).toBe(false)
  })

  it('pagamento de anúncio cancelado não reativa (fica para estorno manual)', async () => {
    const { svc, tx, notifications } = makeService()
    tx.ad.findUnique.mockResolvedValue({ id: 'a1', userId: 'u1', status: 'CANCELLED', days: 7 })
    await svc.ativarPago('a1', 'p1')
    expect(tx.ad.update).not.toHaveBeenCalled()
    expect(notifications.create).not.toHaveBeenCalled()
  })
})

describe('AdsService.approve / pay', () => {
  it('aprovar só sai de PENDING_REVIEW', async () => {
    const { svc, prisma } = makeService()
    prisma.ad.updateMany.mockResolvedValue({ count: 0 })
    await expect(svc.approve('a1')).rejects.toThrow(/esperando aprovação/)
  })

  it('não gera PIX depois do prazo', async () => {
    const { svc, prisma, payments } = makeService()
    prisma.ad.findUnique.mockResolvedValue({
      id: 'a1', userId: 'u1', status: 'AWAITING_PAYMENT', payDeadline: new Date(Date.now() - 1000), payment: null,
    })
    await expect(svc.pay('u1', 'a1')).rejects.toThrow(/prazo/)
    expect(payments.createAdPix).not.toHaveBeenCalled()
  })

  it('reaproveita PIX ainda válido em vez de gerar outro', async () => {
    const { svc, prisma, payments } = makeService()
    prisma.ad.findUnique.mockResolvedValue({
      id: 'a1', userId: 'u1', status: 'AWAITING_PAYMENT', payDeadline: new Date(Date.now() + 86400000),
      totalPrice: 70, pricePerDay: 10,
      payment: { id: 'p1', status: 'PENDING', pixCode: 'abc', pixQrBase64: 'qr', pixExpiresAt: new Date(Date.now() + 60000) },
    })
    const r = await svc.pay('u1', 'a1')
    expect(payments.createAdPix).not.toHaveBeenCalled()
    expect(r.pix?.code).toBe('abc')
  })

  it('anúncio de outra pessoa → acesso negado', async () => {
    const { svc, prisma } = makeService()
    prisma.ad.findUnique.mockResolvedValue({ id: 'a1', userId: 'outro', status: 'AWAITING_PAYMENT' })
    await expect(svc.pay('u1', 'a1')).rejects.toThrow(/Acesso negado/)
  })
})
