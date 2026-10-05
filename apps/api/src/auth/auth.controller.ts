import { Body, Controller, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { GoogleAuthDto } from './dto/google-auth.dto'
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto'
import { RefreshTokenDto } from './dto/refresh-token.dto'

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  // Limite rígido contra brute-force / cadastro em massa: 8 tentativas por minuto por IP.
  @Throttle({ default: { ttl: 60_000, limit: 8 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto)
  }

  @Throttle({ default: { ttl: 60_000, limit: 8 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto)
  }

  // Login social — Google (verifica o ID token no servidor).
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('google')
  google(@Body() dto: GoogleAuthDto) {
    return this.auth.authGoogle(dto.idToken, dto.referralCode)
  }

  // Renovação de sessão. O app chama isto sozinho quando o token de acesso expira —
  // sem esta rota o 401 virava logout silencioso. Limite mais folgado porque é
  // automático e vários usuários podem sair do mesmo IP.
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refreshSession(dto.refreshToken)
  }

  // Recuperação de senha. Limites apertados: pedir código é caro (manda e-mail) e
  // tentar código é adivinhação — os dois precisam de rédea curta por IP.
  @Throttle({ default: { ttl: 60_000, limit: 4 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email)
  }

  @Throttle({ default: { ttl: 60_000, limit: 6 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.email, dto.code, dto.newPassword)
  }
}
