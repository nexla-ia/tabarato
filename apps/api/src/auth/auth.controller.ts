import { Body, Controller, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { GoogleAuthDto } from './dto/google-auth.dto'

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
    return this.auth.authGoogle(dto.idToken)
  }
}
