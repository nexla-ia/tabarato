import { DeliveryGateway } from './delivery.gateway'

// Autorização do chat/rastreio: só o CLIENTE dono do pedido, o DONO DA LOJA e o
// ENTREGADOR ATRIBUÍDO podem ler/escrever. É o que impede um terceiro de espiar
// a conversa (e o endereço) de um pedido alheio.

const CLIENTE = 'u-cliente'
const LOJISTA = 'u-lojista'
const MOTOBOY = 'u-motoboy'
const ESTRANHO = 'u-estranho'

/** Pedido com os três participantes, num dado status. */
const order = (status = 'PREPARING') => ({
  status,
  userId: CLIENTE,
  store: { userId: LOJISTA },
  delivery: { courier: { userId: MOTOBOY } },
})

function makeGateway(over: any = {}) {
  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue(order()) },
    chatMessage: {
      create: jest.fn().mockResolvedValue({ id: 'm1', content: 'oi' }),
      findMany: jest.fn().mockResolvedValue([{ id: 'm1' }]),
    },
    ...(over.prisma ?? {}),
  }
  const gw = new DeliveryGateway({} as any, prisma as any)
  const emit = jest.fn()
  gw.server = { to: jest.fn().mockReturnValue({ emit }) } as any
  return { gw, prisma, roomEmit: emit }
}

/** Socket falso já autenticado como `sub`. */
function socketOf(sub: string, role = 'CONSUMER') {
  return { user: { sub, role }, emit: jest.fn(), join: jest.fn(), leave: jest.fn() } as any
}

describe('DeliveryGateway — quem pode entrar na sala do pedido', () => {
  it.each([
    ['cliente dono', CLIENTE],
    ['dono da loja', LOJISTA],
    ['entregador atribuído', MOTOBOY],
  ])('%s entra na sala', async (_l, sub) => {
    const { gw } = makeGateway()
    const client = socketOf(sub)
    await gw.handleWatch(client, { orderId: 'o1' })
    expect(client.join).toHaveBeenCalledWith('order:o1')
  })

  it('estranho NÃO entra na sala', async () => {
    const { gw } = makeGateway()
    const client = socketOf(ESTRANHO)
    await gw.handleWatch(client, { orderId: 'o1' })
    expect(client.join).not.toHaveBeenCalled()
  })

  it('socket não autenticado NÃO entra', async () => {
    const { gw } = makeGateway()
    const client = { emit: jest.fn(), join: jest.fn() } as any
    await gw.handleWatch(client, { orderId: 'o1' })
    expect(client.join).not.toHaveBeenCalled()
  })

  it('pedido inexistente → não entra', async () => {
    const { gw, prisma } = makeGateway()
    prisma.order.findUnique.mockResolvedValue(null)
    const client = socketOf(CLIENTE)
    await gw.handleWatch(client, { orderId: 'o1' })
    expect(client.join).not.toHaveBeenCalled()
  })
})

describe('DeliveryGateway — chat:send', () => {
  it('participante manda mensagem → grava e transmite pra sala do pedido', async () => {
    const { gw, prisma, roomEmit } = makeGateway()
    const client = socketOf(MOTOBOY, 'COURIER')

    await gw.handleChatMessage(client, { orderId: 'o1', content: '  cheguei  ' })

    expect(prisma.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'o1', senderId: MOTOBOY, senderRole: 'COURIER', content: 'cheguei',
        }),
      }),
    )
    expect(gw.server.to).toHaveBeenCalledWith('order:o1')
    expect(roomEmit).toHaveBeenCalledWith('chat:message', expect.objectContaining({ id: 'm1' }))
  })

  it('estranho NÃO consegue mandar mensagem', async () => {
    const { gw, prisma } = makeGateway()
    await gw.handleChatMessage(socketOf(ESTRANHO), { orderId: 'o1', content: 'oi' })
    expect(prisma.chatMessage.create).not.toHaveBeenCalled()
  })

  it('mensagem vazia é ignorada', async () => {
    const { gw, prisma } = makeGateway()
    await gw.handleChatMessage(socketOf(CLIENTE), { orderId: 'o1', content: '   ' })
    expect(prisma.chatMessage.create).not.toHaveBeenCalled()
  })

  it('corta a mensagem em 500 caracteres', async () => {
    const { gw, prisma } = makeGateway()
    await gw.handleChatMessage(socketOf(CLIENTE), { orderId: 'o1', content: 'x'.repeat(900) })
    const sent = prisma.chatMessage.create.mock.calls[0][0].data.content
    expect(sent).toHaveLength(500)
  })

  it.each(['DELIVERED', 'CANCELLED'])('pedido %s → conversa encerrada (avisa e não grava)', async (status) => {
    const { gw, prisma } = makeGateway()
    prisma.order.findUnique.mockResolvedValue(order(status))
    const client = socketOf(CLIENTE)

    await gw.handleChatMessage(client, { orderId: 'o1', content: 'oi' })

    expect(client.emit).toHaveBeenCalledWith('chat:closed', { orderId: 'o1', reason: status })
    expect(prisma.chatMessage.create).not.toHaveBeenCalled()
  })
})

describe('DeliveryGateway — chat:history', () => {
  it('participante recebe o histórico (limitado a 100, em ordem)', async () => {
    const { gw, prisma } = makeGateway()
    const client = socketOf(LOJISTA, 'STORE_OWNER')

    await gw.handleChatHistory(client, { orderId: 'o1' })

    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: 'o1' }, orderBy: { createdAt: 'asc' }, take: 100,
      }),
    )
    expect(client.emit).toHaveBeenCalledWith('chat:history', [{ id: 'm1' }])
  })

  it('estranho NÃO recebe histórico', async () => {
    const { gw, prisma } = makeGateway()
    const client = socketOf(ESTRANHO)
    await gw.handleChatHistory(client, { orderId: 'o1' })
    expect(prisma.chatMessage.findMany).not.toHaveBeenCalled()
    expect(client.emit).not.toHaveBeenCalled()
  })

  it('pedido sem entregador ainda: cliente e loja seguem lendo', async () => {
    const { gw, prisma } = makeGateway()
    prisma.order.findUnique.mockResolvedValue({ ...order(), delivery: null })
    const client = socketOf(CLIENTE)
    await gw.handleChatHistory(client, { orderId: 'o1' })
    expect(client.emit).toHaveBeenCalledWith('chat:history', expect.any(Array))
  })
})
