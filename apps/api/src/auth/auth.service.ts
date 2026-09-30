import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { MailService } from '../common/mail.service'
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
    private mail: MailService,
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

    // O bônus de indicação NÃO é concedido no cadastro (era farmável com contas
    // descartáveis). É pago no 1º pedido ENTREGUE do indicado (couriers.service).
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
  async authGoogle(idToken: string, referralCode?: string) {
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
    const allowed = (audEnv ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    // Fail-CLOSED: sem client id configurado, NÃO aceitar (senão um ID token emitido
    // para outro app Google seria aceito → takeover da conta por confused-deputy).
    if (allowed.length === 0) throw new UnauthorizedException('Login com Google indisponível no momento.')
    if (!allowed.includes(payload.aud)) throw new UnauthorizedException('Token do Google inválido (audiência).')
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
      // Indicação (opcional): resolve o indicador; o bônus é pago no 1º pedido
      // entregue do indicado (não no cadastro) — mesma regra do register.
      let referrerId: string | undefined
      if (referralCode) {
        const referrer = await this.prisma.user.findUnique({ where: { referralCode: referralCode.toUpperCase() } })
        if (referrer) referrerId = referrer.id
      }
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
          referredBy: referrerId,
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

  // ── Recuperação de senha (código de 6 dígitos por e-mail) ──────────────────
  private static readonly RESET_TTL_MIN = 15
  private static readonly RESET_MAX_ATTEMPTS = 5

  /**
   * Pede o código. A resposta é SEMPRE a mesma, exista o e-mail ou não — senão o
   * endpoint viraria um consultor de "quem tem conta aqui". O código só existe em
   * hash no banco; o claro vai só no e-mail.
   */
  async forgotPassword(email: string) {
    const generic = { message: 'Se houver uma conta com esse e-mail, enviamos um código.' }
    const normalized = (email ?? '').trim().toLowerCase()
    if (!normalized) return generic

    const user = await this.prisma.user.findUnique({ where: { email: normalized } })
    if (!user || !user.isActive) return generic

    // Pedir um código novo invalida os anteriores que ainda estavam de pé.
    await this.prisma.passwordReset.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    })

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        codeHash: await bcrypt.hash(code, 10),
        expiresAt: new Date(Date.now() + AuthService.RESET_TTL_MIN * 60_000),
      },
    })

    await this.mail.sendPasswordResetCode(user.email, user.name, code, AuthService.RESET_TTL_MIN)
    return generic
  }

  /**
   * Troca a senha usando o código. Erros são genéricos de propósito (não dizemos se
   * foi o e-mail, o código ou a validade). Cada palpite errado consome uma tentativa.
   */
  async resetPassword(email: string, code: string, newPassword: string) {
    const invalid = new BadRequestException('Código inválido ou expirado. Peça um novo.')
    const normalized = (email ?? '').trim().toLowerCase()
    const digits = (code ?? '').replace(/\D/g, '')
    if (!normalized || digits.length !== 6) throw invalid

    const user = await this.prisma.user.findUnique({ where: { email: normalized } })
    if (!user || !user.isActive) throw invalid

    const reset = await this.prisma.passwordReset.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    if (!reset) throw invalid

    if (reset.attempts >= AuthService.RESET_MAX_ATTEMPTS) {
      await this.prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } })
      throw new BadRequestException('Muitas tentativas. Peça um novo código.')
    }

    const ok = await bcrypt.compare(digits, reset.codeHash)
    if (!ok) {
      // Consome a tentativa ATOMICAMENTE (só enquanto ainda houver saldo), pra
      // palpites em paralelo não furarem o limite.
      const bumped = await this.prisma.passwordReset.updateMany({
        where: { id: reset.id, usedAt: null, attempts: { lt: AuthService.RESET_MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      })
      if (bumped.count === 0) throw new BadRequestException('Muitas tentativas. Peça um novo código.')
      throw invalid
    }

    // Claim atômico do código: só UMA chamada concorrente consegue usá-lo.
    const claim = await this.prisma.passwordReset.updateMany({
      where: { id: reset.id, usedAt: null },
      data: { usedAt: new Date() },
    })
    if (claim.count === 0) throw invalid

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 10),
        // Derruba as sessões antigas: quem recuperou a conta expulsa quem estava dentro.
        passwordChangedAt: new Date(),
      },
    })

    return { message: 'Senha alterada. Entre com a nova senha.' }
  }

  private sanitizeUser(user: any) {
    return {
      id: user.id, name: user.name, email: user.email, phone: user.phone,
      role: user.role, avatarUrl: user.avatarUrl, city: user.city, state: user.state,
      referralCode: user.referralCode,
    }
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
