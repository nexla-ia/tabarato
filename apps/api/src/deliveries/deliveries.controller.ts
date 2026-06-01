import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { DeliveriesService } from './deliveries.service'
import { AssignDeliveryDto } from './dto/assign-delivery.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STORE_OWNER')
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Post()
  assign(@CurrentUser() user: any, @Body() dto: AssignDeliveryDto) {
    return this.deliveriesService.assign(user.sub, dto.orderId, dto.courierId)
  }

  @Get('order/:orderId')
  getByOrder(@CurrentUser() user: any, @Param('orderId') orderId: string) {
    return this.deliveriesService.getByOrder(user.sub, orderId)
  }
}
