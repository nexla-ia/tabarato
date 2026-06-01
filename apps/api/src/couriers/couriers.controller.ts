import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { CouriersService } from './couriers.service'
import { CreateCourierDto } from './dto/create-courier.dto'
import { UpdateLocationDto } from './dto/update-location.dto'

@UseGuards(JwtAuthGuard)
@Controller('couriers')
export class CouriersController {
  constructor(private readonly couriersService: CouriersService) {}

  @UseGuards(RolesGuard)
  @Roles('COURIER')
  @Post()
  register(@CurrentUser() user: any, @Body() dto: CreateCourierDto) {
    return this.couriersService.register(user.sub, dto)
  }

  @UseGuards(RolesGuard)
  @Roles('COURIER')
  @Get('me')
  getMe(@CurrentUser() user: any) {
    return this.couriersService.findMe(user.sub)
  }

  @UseGuards(RolesGuard)
  @Roles('COURIER')
  @Patch('me/location')
  updateLocation(@CurrentUser() user: any, @Body() dto: UpdateLocationDto) {
    return this.couriersService.updateLocation(user.sub, dto)
  }

  @UseGuards(RolesGuard)
  @Roles('COURIER')
  @Patch('me/toggle-online')
  toggleOnline(@CurrentUser() user: any) {
    return this.couriersService.toggleOnline(user.sub)
  }

  @UseGuards(RolesGuard)
  @Roles('COURIER')
  @Get('me/deliveries')
  getMyDeliveries(@CurrentUser() user: any) {
    return this.couriersService.findMyDeliveries(user.sub)
  }

  @UseGuards(RolesGuard)
  @Roles('COURIER')
  @Get('me/available-deliveries')
  getAvailableDeliveries() {
    return this.couriersService.findAvailableDeliveries()
  }

  @UseGuards(RolesGuard)
  @Roles('COURIER')
  @Patch('me/deliveries/:id/accept')
  acceptDelivery(@CurrentUser() user: any, @Param('id') id: string) {
    return this.couriersService.acceptDelivery(user.sub, id)
  }

  @UseGuards(RolesGuard)
  @Roles('COURIER')
  @Get('me/history')
  getHistory(@CurrentUser() user: any) {
    return this.couriersService.findDeliveryHistory(user.sub)
  }

  @UseGuards(RolesGuard)
  @Roles('COURIER')
  @Get('me/wallet')
  getWallet(@CurrentUser() user: any) {
    return this.couriersService.findWallet(user.sub)
  }

  @UseGuards(RolesGuard)
  @Roles('COURIER')
  @Post('me/wallet/withdraw')
  requestWithdrawal(@CurrentUser() user: any, @Body() body: { amount: number }) {
    return this.couriersService.requestWithdrawal(user.sub, body.amount)
  }

  @UseGuards(RolesGuard)
  @Roles('COURIER')
  @Patch('me/deliveries/:id/advance')
  advanceDelivery(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { photoUrl?: string }) {
    return this.couriersService.advanceDelivery(user.sub, id, body.photoUrl)
  }

  @UseGuards(RolesGuard)
  @Roles('COURIER')
  @Patch('me/deliveries/:id/return')
  returnDelivery(@CurrentUser() user: any, @Param('id') id: string) {
    return this.couriersService.returnDelivery(user.sub, id)
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'STORE_OWNER')
  @Get('available')
  findAvailable() {
    return this.couriersService.findAvailable()
  }
}
