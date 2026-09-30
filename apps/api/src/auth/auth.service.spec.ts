import { BadRequestException } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { AuthService } from './auth.service'

// Recuperação de senha: código curto (6 dígitos), então o que protege a conta é o
// conjunto — resposta genérica, validade, uso único e limite de tentativas.

function makeAuth(over: any = {}) {
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    passwordReset: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    ...(over.prisma ?? {}),
  }
  const jwt = { sign: jest.fn().mockReturnValue('tok') }
  const config = { get: jest.fn() }
  const mail = { sendPasswordResetCode: jest.fn().mockResolvedValue(true), send: jest.fn() }
  const svc = new AuthService(prisma as any, jwt as any, config as any, mail as any)
  return { svc, prisma, mail }
}

const ACTIVE_USER = { id: 'u1', email: 'cliente@teste.com', name: 'Ana Souza', isActive: true }
const GENERIC = 'Se houver uma conta com esse e-mail, enviamos um código.'

/** Registro de reset válido para o código informado. */
async function resetFor(code: string, over: any = {}) {
  return {
    id: 'r1', userId: 'u1', attempts: 0, usedAt: null,
    codeHash: await bcrypt.hash(code, 10),
    expiresAt: new Date(Date.now() + 10 * 60_000),
    ...over,
  }
}

describe('AuthService.forgotPassword', () => {
  it('e-mail que não existe → mesma resposta genérica, sem criar código nem enviar e-mail', async () => {
    const { svc, prisma, mail } = makeAuth()
    prisma.user.findUnique.mockResolvedValue(null)
    const r = await svc.forgotPassword('naoexiste@teste.com')
    expect(r.message).toBe(GENERIC)
    expect(prisma.passwordReset.create).not.toHaveBeenCalled()
    expect(mail.sendPasswordResetCode).not.toHaveBeenCalled()
  })

  it('conta desativada → resposta genérica, sem enviar', async () => {
    const { svc, prisma, mail } = makeAuth()
    prisma.user.findUnique.mockResolvedValue({ ...ACTIVE_USER, isActive: false })
    const r = await svc.forgotPassword(ACTIVE_USER.email)
    expect(r.message).toBe(GENERIC)
    expect(mail.sendPasswordResetCode).not.toHaveBeenCalled()
  })

  it('e-mail válido → invalida os códigos anteriores e cria um novo', async () => {
    const { svc, prisma } = makeAuth()
    prisma.user.findUnique.mockResolvedValue(ACTIVE_USER)
    await svc.forgotPassword('  Cliente@Teste.com  ') // espaços e maiúsculas
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'cliente@teste.com' } })
    expect(prisma.passwordReset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', usedAt: null } }),
    )
    expect(prisma.passwordReset.create).toHaveBeenCalledTimes(1)
  })

  it('guarda só o HASH do código (nunca o número em claro) e envia o claro por e-mail', async () => {
    const { svc, prisma, mail } = makeAuth()
    prisma.user.findUnique.mockResolvedValue(ACTIVE_USER)
    await svc.forgotPassword(ACTIVE_USER.email)

    const saved = prisma.passwordReset.create.mock.calls[0][0].data
    const sentCode = mail.sendPasswordResetCode.mock.calls[0][2]

    expect(sentCode).toMatch(/^\d{6}$/)
    expect(saved.codeHash).not.toBe(sentCode)          // nada de código em claro no banco
    expect(await bcrypt.compare(sentCode, saved.codeHash)).toBe(true)
    expect(saved.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })
})

describe('AuthService.resetPassword', () => {
  it('código correto → troca a senha e derruba as sessões antigas', async () => {
    const { svc, prisma } = makeAuth()
    prisma.user.findUnique.mockResolvedValue(ACTIVE_USER)
    prisma.passwordReset.findFirst.mockResolvedValue(await resetFor('123456'))
    prisma.passwordReset.updateMany.mockResolvedValue({ count: 1 }) // claim do código

    await svc.resetPassword(ACTIVE_USER.email, '123456', 'novaSenha123')

    const data = prisma.user.update.mock.calls[0][0].data
    expect(await bcrypt.compare('novaSenha123', data.passwordHash)).toBe(true)
    expect(data.passwordChangedAt).toBeInstanceOf(Date)
  })

  it('código errado → consome tentativa e recusa, sem trocar a senha', async () => {
    const { svc, prisma } = makeAuth()
    prisma.user.findUnique.mockResolvedValue(ACTIVE_USER)
    prisma.passwordReset.findFirst.mockResolvedValue(await resetFor('123456'))

    await expect(svc.resetPassword(ACTIVE_USER.email, '000000', 'novaSenha123'))
      .rejects.toBeInstanceOf(BadRequestException)

    expect(prisma.passwordReset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } }),
    )
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('código expirado ou já usado → recusa (não vem na busca)', async () => {
    const { svc, prisma } = makeAuth()
    prisma.user.findUnique.mockResolvedValue(ACTIVE_USER)
    prisma.passwordReset.findFirst.mockResolvedValue(null)
    await expect(svc.resetPassword(ACTIVE_USER.email, '123456', 'novaSenha123'))
      .rejects.toThrow('inválido ou expirado')
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('estourou o limite de tentativas → bloqueia e queima o código', async () => {
    const { svc, prisma } = makeAuth()
    prisma.user.findUnique.mockResolvedValue(ACTIVE_USER)
    prisma.passwordReset.findFirst.mockResolvedValue(await resetFor('123456', { attempts: 5 }))
    await expect(svc.resetPassword(ACTIVE_USER.email, '123456', 'novaSenha123'))
      .rejects.toThrow('Muitas tentativas')
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('corrida: outra chamada usou o código primeiro (claim=0) → recusa', async () => {
    const { svc, prisma } = makeAuth()
    prisma.user.findUnique.mockResolvedValue(ACTIVE_USER)
    prisma.passwordReset.findFirst.mockResolvedValue(await resetFor('123456'))
    prisma.passwordReset.updateMany.mockResolvedValue({ count: 0 })
    await expect(svc.resetPassword(ACTIVE_USER.email, '123456', 'novaSenha123'))
      .rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it.each([['12345', 'curto'], ['abcdef', 'sem dígitos'], ['', 'vazio']])(
    'código malformado (%s) → recusa sem nem consultar o banco', async (code) => {
      const { svc, prisma } = makeAuth()
      await expect(svc.resetPassword(ACTIVE_USER.email, code, 'novaSenha123'))
        .rejects.toBeInstanceOf(BadRequestException)
      expect(prisma.passwordReset.findFirst).not.toHaveBeenCalled()
    })
})
