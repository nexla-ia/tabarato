import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET'),
    })
  }

  // Revalida a conta a cada request: um usuário desativado (isActive=false) perde o
  // acesso NA HORA, sem esperar o token de 7 dias expirar. 1 lookup por PK (barato).
  async validate(payload: { sub: string; email: string; role: string; iat?: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { isActive: true, passwordChangedAt: true },
    })
    if (!user || !user.isActive) throw new UnauthorizedException('Conta indisponível.')

    // Token emitido ANTES da última troca de senha não vale mais: quem recuperou a
    // conta derruba a sessão de quem estava dentro. (iat vem em segundos; 1s de folga
    // cobre o arredondamento de quem acabou de trocar a senha e recebeu token novo.)
    if (user.passwordChangedAt && payload.iat != null) {
      if (payload.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
        throw new UnauthorizedException('Sua senha mudou. Entre novamente.')
      }
    }
    return { sub: payload.sub, email: payload.email, role: payload.role }
  }
}
