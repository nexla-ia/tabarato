import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { CouponsService } from './coupons.service'
import { CreateCouponDto } from './dto/create-coupon.dto'

@UseGuards(JwtAuthGuard)
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  // Store owner: create coupon
  @UseGuards(RolesGuard)
  @Roles('STORE_OWNER')
  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateCouponDto) {
    return this.couponsService.create(user.sub, dto)
  }

  // Store owner: list own coupons
  @UseGuards(RolesGuard)
  @Roles('STORE_OWNER')
  @Get()
  findByStore(@CurrentUser() user: any) {
    return this.couponsService.findByStore(user.sub)
  }

  // Store owner: toggle active
  @UseGuards(RolesGuard)
  @Roles('STORE_OWNER')
  @Patch(':id/toggle')
  toggle(@CurrentUser() user: any, @Param('id') id: string) {
    return this.couponsService.toggle(user.sub, id)
  }

  // Store owner: delete coupon
  @UseGuards(RolesGuard)
  @Roles('STORE_OWNER')
  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.couponsService.remove(user.sub, id)
  }

  // Consumer: validate coupon before placing order
  @Get('validate')
  validatePublic(
    @CurrentUser() user: any,
    @Query('code') code: string,
    @Query('subtotal') subtotal: string,
    @Query('storeId') storeId: string,
  ) {
    return this.couponsService.validatePublic(code, user.sub, parseFloat(subtotal), storeId)
  }
}
