import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards, BadRequestException } from '@nestjs/common'
import { Response } from 'express'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { StoresService } from './stores.service'
import { CreateStoreDto } from './dto/create-store.dto'
import { UpdateStoreDto } from './dto/update-store.dto'

@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  findAll(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('userLat') userLat?: string,
    @Query('userLng') userLng?: string,
  ) {
    const lat = userLat ? parseFloat(userLat) : undefined
    const lng = userLng ? parseFloat(userLng) : undefined
    return this.storesService.findAll(categoryId, search, lat, lng)
  }

  @Get('categories')
  listCategories() {
    return this.storesService.listCategories()
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Get('my')
  getMyStore(@CurrentUser() user: any) {
    return this.storesService.findMyStore(user.sub)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Patch('my')
  update(@CurrentUser() user: any, @Body() dto: UpdateStoreDto) {
    return this.storesService.update(user.sub, dto)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Patch('my/toggle-open')
  toggleOpen(@CurrentUser() user: any) {
    return this.storesService.toggleOpen(user.sub)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Patch('my/toggle-pause')
  togglePause(@CurrentUser() user: any) {
    return this.storesService.togglePause(user.sub)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Post('my/categories/:categoryId')
  addCategory(@CurrentUser() user: any, @Param('categoryId') categoryId: string) {
    return this.storesService.addCategory(user.sub, categoryId)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateStoreDto) {
    return this.storesService.create(user.sub, dto)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Get('my/wallet')
  getWallet(@CurrentUser() user: any) {
    return this.storesService.findWallet(user.sub)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Post('my/wallet/withdraw')
  requestWithdrawal(@CurrentUser() user: any, @Body() body: { amount: number }) {
    if (!body.amount || body.amount <= 0) throw new BadRequestException('Valor inválido para saque.')
    return this.storesService.requestWithdrawal(user.sub, body.amount)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Get('my/reviews')
  getMyReviews(@CurrentUser() user: any, @Query('page') page?: string) {
    return this.storesService.findMyReviews(user.sub, page ? parseInt(page) : 1)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Get('my/analytics')
  getAnalytics(@CurrentUser() user: any) {
    return this.storesService.getAnalytics(user.sub)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Get('my/transactions/:txId/receipt')
  async getReceipt(@CurrentUser() user: any, @Param('txId') txId: string, @Res() res: Response) {
    const text = await this.storesService.getTransactionReceipt(user.sub, txId)
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.send(text)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Get('my/orders/export')
  async exportOrders(@CurrentUser() user: any, @Res() res: Response) {
    const csv = await this.storesService.exportOrdersCsv(user.sub)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="pedidos.csv"')
    res.send('﻿' + csv) // BOM for Excel compatibility
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.storesService.findById(id)
  }
}
