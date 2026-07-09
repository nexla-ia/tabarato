import { Controller, Get, Query, Req, Res, UseGuards, BadRequestException } from '@nestjs/common'
import type { Response } from 'express'
import { ConfigService } from '@nestjs/config'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
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

  /** Status da conexão MP da loja do lojista logado. */
  @UseGuards(JwtAuthGuard)
  @Get('status')
  async status(@CurrentUser() user: any) {
    const store = await this.prisma.store.findUnique({
      where: { userId: user.sub },
      select: { mpConnected: true, mpUserId: true },
    })
    return {
      enabled: this.mp.isEnabled(),
      connected: Boolean(store?.mpConnected),
      mpUserId: store?.mpUserId ?? null,
    }
  }

  /** Devolve a URL de autorização pra conectar a conta MP do lojista. */
  @UseGuards(JwtAuthGuard)
  @Get('connect')
  async connect(@CurrentUser() user: any) {
    const store = await this.prisma.store.findUnique({ where: { userId: user.sub }, select: { id: true } })
    if (!store) throw new BadRequestException('Loja não encontrada.')
    return { url: this.mp.getAuthUrl(store.id) }
  }

  /** Desconecta a conta MP. */
  @UseGuards(JwtAuthGuard)
  @Get('disconnect')
  async disconnect(@CurrentUser() user: any) {
    const store = await this.prisma.store.findUnique({ where: { userId: user.sub }, select: { id: true } })
    if (!store) throw new BadRequestException('Loja não encontrada.')
    await this.mp.disconnect(store.id)
    return { connected: false }
  }

  /** Callback do Mercado Pago (browser). Troca o code, salva e volta pro painel. */
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response, @Req() _req: any) {
    const panel = this.config.get<string>('WEB_URL') ?? 'https://tabarato-production.up.railway.app'
    const back = (ok: boolean) => `${panel}/lojista/config?mp=${ok ? 'ok' : 'erro'}`

    const storeId = state ? this.mp.verifyState(state) : null
    if (!code || !storeId) return res.redirect(back(false))

    try {
      await this.mp.connectStore(storeId, code)
      return res.redirect(back(true))
    } catch {
      return res.redirect(back(false))
    }
  }
}
