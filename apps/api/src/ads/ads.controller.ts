import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { AdsService } from './ads.service'
import { CreateAdDto, RejectAdDto } from './dto/create-ad.dto'

@Controller('ads')
export class AdsController {
  constructor(private readonly ads: AdsService) {}

  /** Preço, mínimo de dias e quando entraria no ar — a tela de anunciar monta tudo com isso. */
  @Get('config')
  config() {
    return this.ads.getConfig()
  }

  /** O carrossel da tela inicial. */
  @Get('live')
  live() {
    return this.ads.live()
  }

  // Públicos e chamados a cada exibição: limite próprio para não inflar métrica.
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Post(':id/view')
  view(@Param('id', ParseUUIDPipe) id: string) {
    return this.ads.track(id, 'view')
  }

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post(':id/click')
  click(@Param('id', ParseUUIDPipe) id: string) {
    return this.ads.track(id, 'click')
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateAdDto) {
    return this.ads.create(user.sub, dto)
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  mine(@CurrentUser() user: any) {
    return this.ads.mine(user.sub)
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine/:id')
  getMine(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.ads.getMine(user.sub, id)
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('mine/:id/pay')
  pay(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.ads.pay(user.sub, id)
  }

  @UseGuards(JwtAuthGuard)
  @Post('mine/:id/cancel')
  cancel(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.ads.cancel(user.sub, id)
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/ads')
export class AdminAdsController {
  constructor(private readonly ads: AdsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.ads.adminList(status)
  }

  @Post(':id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.ads.approve(id)
  }

  @Post(':id/reject')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectAdDto) {
    return this.ads.reject(id, dto.reason)
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.ads.adminCancel(id)
  }
}
