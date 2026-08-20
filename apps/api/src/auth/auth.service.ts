import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import * as bcrypt from 'bcryptjs'
import * as crypto from 'crypto'

function generateReferralCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase() // e.g. A1B2C3D4
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (existing) throw new ConflictException('E-mail já cadastrado')

    // Find referrer if referral code provided
    let referrerId: string | undefined
    if (dto.referralCode) {
      const referrer = await this.prisma.user.findUnique({
        where: { referralCode: dto.referralCode.toUpperCase() },
      })
      if (referrer) referrerId = referrer.id
    }

    // Segurança: o cadastro público NUNCA pode virar ADMIN. Só permite os papéis
    // de auto-registro (consumidor, lojista, entregador). Promoção a ADMIN é fluxo
    // interno/manual, jamais via /auth/register.
    const SELF_ROLES = ['CONSUMER', 'STORE_OWNER', 'COURIER'] as const
    const role = SELF_ROLES.includes(dto.role as any) ? (dto.role as any) : 'CONSUMER'

    const passwordHash = await bcrypt.hash(dto.password, 10)
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        city: dto.city,
        state: dto.state,
        passwordHash,
        role,
        referralCode: generateReferralCode(),
        referredBy: referrerId,
      },
    })

    // Grant referral bonus to both parties (fire-and-forget)
    if (referrerId) {
      this.grantReferralBonus(referrerId, user.id).catch(() => {})
    }

    const tokens = this.generateTokens(user.id, user.email, user.role)
    return { user: this.sanitizeUser(user), ...tokens }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (!user) throw new UnauthorizedException('Credenciais inválidas')

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('Credenciais inválidas')

    if (!user.isActive) throw new UnauthorizedException('Conta desativada')

    const tokens = this.generateTokens(user.id, user.email, user.role)
    return { user: this.sanitizeUser(user), ...tokens }
  }

  // ── Login social: Google ──────────────────────────────────────────────────
  // Verifica o ID token no endpoint oficial do Google (valida assinatura/expiração),
  // confere a audiência (nosso client id) e o e-mail verificado. Cria o usuário na
  // 1ª vez (sem senha utilizável — login só via Google). Casa por e-mail (verificado).
  async authGoogle(idToken: string) {
    if (!idToken) throw new UnauthorizedException('Token do Google ausente.')

    let payload: any
    try {
      const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`)
      if (!res.ok) throw new Error('invalid')
      payload = await res.json()
    } catch {
      throw new UnauthorizedException('Não foi possível validar o login com o Google.')
    }

    // aud = o client id do Google (Web). Se configurado, exige bater (senão o token
    // poderia ser de outro app). Aceita a lista separada por vírgula (Web/Android/iOS).
    const audEnv = this.config.get<string>('GOOGLE_CLIENT_IDS') ?? this.config.get<string>('GOOGLE_WEB_CLIENT_ID')
    if (audEnv) {
      const allowed = audEnv.split(',').map((s) => s.trim()).filter(Boolean)
      if (!allowed.includes(payload.aud)) throw new UnauthorizedException('Token do Google inválido (audiência).')
    }
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true'
    if (!emailVerified) throw new UnauthorizedException('E-mail do Google não verificado.')
    const email = (payload.email as string | undefined)?.toLowerCase()
    if (!email) throw new UnauthorizedException('O Google não retornou um e-mail.')

    // Casa por e-mail de forma case-insensitive: se já existe conta (criada no
    // cadastro normal, mesmo com e-mail em maiúsculas), o Google entra NELA — não
    // cria duplicata. Como o Google já provou a posse do e-mail (verificado), o
    // vínculo é seguro. Mantém senha, papel e demais dados da conta existente.
    let user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    })
    if (!user) {
      // Usuário social não tem senha utilizável: grava um hash aleatório.
      const randomHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10)
      user = await this.prisma.user.create({
        data: {
          name: payload.name || email.split('@')[0],
          email,
          avatarUrl: payload.picture || undefined,
          passwordHash: randomHash,
          role: 'CONSUMER',
          referralCode: generateReferralCode(),
        },
      })
    }
    if (!user.isActive) throw new UnauthorizedException('Conta desativada')

    const tokens = this.generateTokens(user.id, user.email, user.role)
    return { user: this.sanitizeUser(user), ...tokens }
  }

  async refreshToken(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user || !user.isActive) throw new UnauthorizedException()
    return this.generateTokens(user.id, user.email, user.role)
  }

  private sanitizeUser(user: any) {
    return {
      id: user.id, name: user.name, email: user.email, phone: user.phone,
      role: user.role, avatarUrl: user.avatarUrl, city: user.city, state: user.state,
      referralCode: user.referralCode,
    }
  }

  private async grantReferralBonus(referrerId: string, newUserId: string) {
    const BONUS = 50
    const upsertAccount = async (userId: string) => {
      return this.prisma.loyaltyAccount.upsert({
        where: { userId },
        create: { userId, points: BONUS, lifetimePoints: BONUS },
        update: { points: { increment: BONUS }, lifetimePoints: { increment: BONUS } },
      })
    }
    const addTx = async (accountId: string, description: string) => {
      await this.prisma.loyaltyTransaction.create({
        data: { accountId, points: BONUS, type: 'BONUS', description },
      })
    }
    const [referrerAccount, newAccount] = await Promise.all([
      upsertAccount(referrerId),
      upsertAccount(newUserId),
    ])
    await Promise.all([
      addTx(referrerAccount.id, 'Bônus de indicação — amigo cadastrado'),
      addTx(newAccount.id, 'Bônus de boas-vindas via indicação'),
    ])
  }

  private generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role }

    // Defaults explícitos: token nunca fica sem expiração se a env faltar.
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRES_IN') ?? '7d',
    })

    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN') ?? '30d',
    })

    return { accessToken, refreshToken }
  }
}
