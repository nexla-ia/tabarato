import { UsersService } from './users.service'

function makeService() {
  const prisma = {
    user: { update: jest.fn().mockResolvedValue({}), findUnique: jest.fn() },
    bibleRequest: { upsert: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  }
  return { svc: new UsersService(prisma as any), prisma }
}

describe('UsersService.answerBibleOffer', () => {
  it('aceitou → cria o pedido e marca que a oferta já foi feita', async () => {
    const { svc, prisma } = makeService()

    await svc.answerBibleOffer('u1', true)

    expect(prisma.bibleRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' }, create: { userId: 'u1' } }),
    )
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: { bibleOfferedAt: expect.any(Date) } }),
    )
  })

  it('recusou → NÃO guarda pedido nenhum, só a marca da pergunta', async () => {
    const { svc, prisma } = makeService()

    await svc.answerBibleOffer('u1', false)

    // Convicção religiosa é dado sensível (LGPD art. 5º, II): de quem recusa não
    // pode sobrar registro do assunto além de "já perguntamos".
    expect(prisma.bibleRequest.upsert).not.toHaveBeenCalled()
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { bibleOfferedAt: expect.any(Date) } }),
    )
  })

  it('recusou depois de ter pedido → apaga o pedido ainda não enviado', async () => {
    const { svc, prisma } = makeService()

    await svc.answerBibleOffer('u1', false)

    expect(prisma.bibleRequest.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', status: 'PENDING' },
    })
  })

  it('aceitou de novo → não reabre pedido que o admin já tratou', async () => {
    const { svc, prisma } = makeService()

    await svc.answerBibleOffer('u1', true)

    // `update: {}` no upsert: se já existe linha (SENT, por exemplo), nada muda.
    expect(prisma.bibleRequest.upsert.mock.calls[0][0].update).toEqual({})
  })
})

describe('UsersService.findById', () => {
  it('nunca vaza a data da oferta — devolve só se deve perguntar', async () => {
    const { svc, prisma } = makeService()
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', name: 'Ana', bibleOfferedAt: null })

    const out: any = await svc.findById('u1')

    expect(out.shouldOfferBible).toBe(true)
    expect(out).not.toHaveProperty('bibleOfferedAt')
  })

  it('já respondeu → não pergunta de novo', async () => {
    const { svc, prisma } = makeService()
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', name: 'Ana', bibleOfferedAt: new Date() })

    const out: any = await svc.findById('u1')

    expect(out.shouldOfferBible).toBe(false)
  })
})
