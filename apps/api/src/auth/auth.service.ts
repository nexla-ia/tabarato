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
    if ((dto as any).referralCode) {
      const referrer = await this.prisma.user.findUnique({
        where: { referralCode: (dto as any).referralCode.toUpperCase() },
      })
      if (referrer) referrerId = referrer.id
    }

    const passwordHash = await bcrypt.hash(dto.password, 10)
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        city: dto.city,
        state: dto.state,
        passwordHash,
        role: dto.role ?? 'CONSUMER',
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

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRES_IN'),
    })

    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN'),
    })

    return { accessToken, refreshToken }
  }
}
