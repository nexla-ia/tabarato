import { UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { generateKeyPairSync } from 'crypto'
import { AuthService } from './auth.service'

// Login com Apple com JwtService DE VERDADE e um par de chaves gerado aqui no
// papel da Apple: prova que assinatura, emissor e audiência são conferidos.

const apple = generateKeyPairSync('rsa', { modulusLength: 2048 })
const intruso = generateKeyPairSync('rsa', { modulusLength: 2048 })
const KID = 'teste-kid'
const jwk = { ...apple.publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' }

const jwt = new JwtService({})

function token(payload: any, opts: { chave?: any; aud?: string; iss?: string } = {}) {
  return jwt.sign(
    { email_verified: 'true', ...payload },
    {
      privateKey: (opts.chave ?? apple.privateKey).export({ type: 'pkcs8', format: 'pem' }) as string,
      algorithm: 'RS256',
      keyid: KID,
      issuer: opts.iss ?? 'https://appleid.apple.com',
      audience: opts.aud ?? 'com.tabarato.consumer',
      expiresIn: '5m',
    },
  )
}

function makeAuth() {
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'u1', email: 'ana@teste.com', role: 'CONSUMER', isActive: true, ...data })),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'novo', isActive: true, ...data })),
    },
  }
  const config = { get: jest.fn() }
  const svc = new AuthService(prisma, jwt, config as any, {} as any)
  ;(svc as any).generateTokens = () => ({ accessToken: 'a', refreshToken: 'r' })
  return { svc, prisma }
}

beforeAll(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ keys: [jwk] }) }) as any
})

describe('AuthService.authApple', () => {
  it('token válido de 1º acesso cria a conta com o nome que o app mandou', async () => {
    const { svc, prisma } = makeAuth()
    const r = await svc.authApple(token({ sub: 'apple-1', email: 'ana@privaterelay.appleid.com' }), 'Ana Souza')
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ appleSub: 'apple-1', email: 'ana@privaterelay.appleid.com', name: 'Ana Souza', role: 'CONSUMER' }),
    }))
    expect(r.accessToken).toBe('a')
  })

  it('quem já tinha conta com o mesmo e-mail entra nela e fica vinculado', async () => {
    const { svc, prisma } = makeAuth()
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', email: 'ana@teste.com', isActive: true })
    await svc.authApple(token({ sub: 'apple-1', email: 'ANA@teste.com' }))
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { appleSub: 'apple-1' } })
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it('token assinado por outra chave (forjado) é recusado', async () => {
    const { svc, prisma } = makeAuth()
    await expect(svc.authApple(token({ sub: 'x', email: 'a@b.com' }, { chave: intruso.privateKey })))
      .rejects.toBeInstanceOf(UnauthorizedException)
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it('token emitido para OUTRO app (audiência) é recusado', async () => {
    const { svc } = makeAuth()
    await expect(svc.authApple(token({ sub: 'x', email: 'a@b.com' }, { aud: 'com.outro.app' })))
      .rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('emissor que não é a Apple é recusado', async () => {
    const { svc } = makeAuth()
    await expect(svc.authApple(token({ sub: 'x', email: 'a@b.com' }, { iss: 'https://evil.com' })))
      .rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('conta desativada (ou excluída) não entra', async () => {
    const { svc, prisma } = makeAuth()
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', isActive: false })
    await expect(svc.authApple(token({ sub: 'apple-1', email: 'a@b.com' }))).rejects.toThrow(/desativada/)
  })
})
