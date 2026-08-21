import { Controller, Get, Query, Res, UseGuards, BadRequestException } from '@nestjs/common'
import type { Response } from 'express'
import { ConfigService } from '@nestjs/config'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { PrismaService } from '../prisma/prisma.service'
import { MpOauthService } from './mp-oauth.service'

@Controller('stores/mp')
export class MpConnectController {
  constructor(
    private readonly mp: MpOauthService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Get('status')
  async status(@CurrentUser() user: any) {
    const store = await this.prisma.store.findUnique({
      where: { userId: user.sub },
      select: { mpConnected: true, mpUserId: true },
    })
    return { enabled: this.mp.isEnabled(), connected: Boolean(store?.mpConnected), mpUserId: store?.mpUserId ?? null }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Get('connect')
  async connect(@CurrentUser() user: any, @Query('origin') origin?: string) {
    const store = await this.prisma.store.findUnique({ where: { userId: user.sub }, select: { id: true } })
    if (!store) throw new BadRequestException('Loja não encontrada.')
    return { url: this.mp.getAuthUrl('store', store.id, origin) }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Get('disconnect')
  async disconnect(@CurrentUser() user: any) {
    const store = await this.prisma.store.findUnique({ where: { userId: user.sub }, select: { id: true } })
    if (!store) throw new BadRequestException('Loja não encontrada.')
    await this.mp.disconnect('store', store.id)
    return { connected: false }
  }

  /** Callback único do MP (browser) — dispatcha loja ou entregador pelo state.
      Se veio do APP (origin=app), mostra página "voltar ao app" (deep link);
      senão redireciona pro painel web. */
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const parsed = state ? this.mp.verifyState(state) : null
    const fromApp = parsed?.origin === 'app'

    const finish = (ok: boolean) => {
      if (fromApp) {
        res.set('Content-Type', 'text/html; charset=utf-8')
        return res.send(this.appReturnHtml(ok))
      }
      const panel = this.config.get<string>('WEB_URL') ?? 'https://tabarato-production.up.railway.app'
      return res.redirect(`${panel}/lojista/config?mp=${ok ? 'ok' : 'erro'}`)
    }

    if (!code || !parsed) return finish(false)
    try {
      await this.mp.connect(parsed.type, parsed.id, code)
      return finish(true)
    } catch {
      return finish(false)
    }
  }

  /** Página simples de retorno pro app (deep link tabarato://). */
  private appReturnHtml(ok: boolean): string {
    const title = ok ? 'Mercado Pago conectado!' : 'Não foi possível conectar'
    const sub = ok
      ? 'Sua conta foi conectada com sucesso. Volte para o app Tá Barato para continuar.'
      : 'Algo deu errado. Volte ao app e tente conectar novamente.'
    return `<!doctype html><html lang="pt-br"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Tá Barato</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#FFF8F3;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
<div style="max-width:360px;text-align:center">
<div style="font-size:56px;margin-bottom:8px">${ok ? '✅' : '⚠️'}</div>
<h1 style="color:#1A0A00;font-size:22px;margin:0 0 8px">${title}</h1>
<p style="color:#7A5C4A;font-size:15px;line-height:1.5;margin:0 0 26px">${sub}</p>
<a href="tabarato://" style="display:inline-block;background:#FF5500;color:#fff;text-decoration:none;font-weight:800;padding:15px 30px;border-radius:14px;font-size:16px">Voltar ao app</a>
</div>
<script>setTimeout(function(){location.href='tabarato://'},700)</script>
</body></html>`
  }
}

@Controller('couriers/mp')
export class MpCourierConnectController {
  constructor(private readonly mp: MpOauthService, private readonly prisma: PrismaService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COURIER')
  @Get('status')
  async status(@CurrentUser() user: any) {
    const courier = await this.prisma.courier.findUnique({
      where: { userId: user.sub },
      select: { mpConnected: true, mpUserId: true },
    })
    return { enabled: this.mp.isAdvancedEnabled(), connected: Boolean(courier?.mpConnected), mpUserId: courier?.mpUserId ?? null }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COURIER')
  @Get('connect')
  async connect(@CurrentUser() user: any) {
    const courier = await this.prisma.courier.findUnique({ where: { userId: user.sub }, select: { id: true } })
    if (!courier) throw new BadRequestException('Entregador não encontrado.')
    return { url: this.mp.getAuthUrl('courier', courier.id) }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COURIER')
  @Get('disconnect')
  async disconnect(@CurrentUser() user: any) {
    const courier = await this.prisma.courier.findUnique({ where: { userId: user.sub }, select: { id: true } })
    if (!courier) throw new BadRequestException('Entregador não encontrado.')
    await this.mp.disconnect('courier', courier.id)
    return { connected: false }
  }
}
