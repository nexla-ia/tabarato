import { Controller, Get, Query, Res, UseGuards, BadRequestException } from '@nestjs/common'
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

  @UseGuards(JwtAuthGuard)
  @Get('status')
  async status(@CurrentUser() user: any) {
    const store = await this.prisma.store.findUnique({
      where: { userId: user.sub },
      select: { mpConnected: true, mpUserId: true },
    })
    return { enabled: this.mp.isEnabled(), connected: Boolean(store?.mpConnected), mpUserId: store?.mpUserId ?? null }
  }

  @UseGuards(JwtAuthGuard)
  @Get('connect')
  async connect(@CurrentUser() user: any) {
    const store = await this.prisma.store.findUnique({ where: { userId: user.sub }, select: { id: true } })
    if (!store) throw new BadRequestException('Loja não encontrada.')
    return { url: this.mp.getAuthUrl('store', store.id) }
  }

  @UseGuards(JwtAuthGuard)
  @Get('disconnect')
  async disconnect(@CurrentUser() user: any) {
    const store = await this.prisma.store.findUnique({ where: { userId: user.sub }, select: { id: true } })
    if (!store) throw new BadRequestException('Loja não encontrada.')
    await this.mp.disconnect('store', store.id)
    return { connected: false }
  }

  /** Callback único do MP (browser) — dispatcha loja ou entregador pelo state. */
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    const panel = this.config.get<string>('WEB_URL') ?? 'https://tabarato-production.up.railway.app'
    const parsed = state ? this.mp.verifyState(state) : null
    const dest = parsed?.type === 'courier' ? '/lojista/config' : '/lojista/config' // entregador usa o app; volta pra web só como confirmação
    const back = (ok: boolean) => `${panel}${dest}?mp=${ok ? 'ok' : 'erro'}`

    if (!code || !parsed) return res.redirect(back(false))
    try {
      await this.mp.connect(parsed.type, parsed.id, code)
      return res.redirect(back(true))
    } catch {
      return res.redirect(back(false))
    }
  }
}

@Controller('couriers/mp')
export class MpCourierConnectController {
  constructor(private readonly mp: MpOauthService, private readonly prisma: PrismaService) {}

  @UseGuards(JwtAuthGuard)
  @Get('status')
  async status(@CurrentUser() user: any) {
    const courier = await this.prisma.courier.findUnique({
      where: { userId: user.sub },
      select: { mpConnected: true, mpUserId: true },
    })
    return { enabled: this.mp.isAdvancedEnabled(), connected: Boolean(courier?.mpConnected), mpUserId: courier?.mpUserId ?? null }
  }

  @UseGuards(JwtAuthGuard)
  @Get('connect')
  async connect(@CurrentUser() user: any) {
    const courier = await this.prisma.courier.findUnique({ where: { userId: user.sub }, select: { id: true } })
    if (!courier) throw new BadRequestException('Entregador não encontrado.')
    return { url: this.mp.getAuthUrl('courier', courier.id) }
  }

  @UseGuards(JwtAuthGuard)
  @Get('disconnect')
  async disconnect(@CurrentUser() user: any) {
    const courier = await this.prisma.courier.findUnique({ where: { userId: user.sub }, select: { id: true } })
    if (!courier) throw new BadRequestException('Entregador não encontrado.')
    await this.mp.disconnect('courier', courier.id)
    return { connected: false }
  }
}
