import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { OrdersService } from './orders.service'
import { CreateOrderDto } from './dto/create-order.dto'
import { UpdateStatusDto } from './dto/update-status.dto'

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.sub, dto)
  }

  @Get()
  findMy(@CurrentUser() user: any) {
    return this.ordersService.findByUser(user.sub)
  }

  @UseGuards(RolesGuard)
  @Roles('STORE_OWNER')
  @Get('store')
  findByStore(@CurrentUser() user: any) {
    return this.ordersService.findByStore(user.sub)
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.ordersService.findById(id, user.sub, user.role)
  }

  @Get(':id/history')
  getHistory(@CurrentUser() user: any, @Param('id') id: string) {
    return this.ordersService.getStatusHistory(id, user.sub, user.role)
  }

  @UseGuards(RolesGuard)
  @Roles('STORE_OWNER')
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.ordersService.updateStatus(user.sub, id, dto.status, dto.refusalNote)
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.ordersService.cancel(user.sub, id)
  }

  // Store owner can cancel up to READY (before pickup)
  @UseGuards(RolesGuard)
  @Roles('STORE_OWNER')
  @Patch(':id/cancel-store')
  cancelByStore(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { note?: string }) {
    return this.ordersService.cancelByStore(user.sub, id, body.note)
  }
}
