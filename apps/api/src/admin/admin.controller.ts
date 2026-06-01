import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { AdminService } from './admin.service'
import { UpdateCourierStatusDto } from './dto/update-courier-status.dto'
import { UpdateCourierDocStatusDto } from './dto/update-courier-doc-status.dto'
import { UpdateStoreStatusDto } from './dto/update-store-status.dto'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  getStats() {
    return this.adminService.getStats()
  }

  @Get('couriers')
  getCouriers(@Query('status') status?: string) {
    return this.adminService.getCouriers(status)
  }

  @Patch('couriers/:id/status')
  updateCourierStatus(@Param('id') id: string, @Body() dto: UpdateCourierStatusDto) {
    return this.adminService.updateCourierStatus(id, dto)
  }

  @Patch('couriers/:id/doc-status')
  updateCourierDocStatus(@Param('id') id: string, @Body() dto: UpdateCourierDocStatusDto) {
    return this.adminService.updateCourierDocStatus(id, dto)
  }

  @Get('stores')
  getStores(@Query('status') status?: string) {
    return this.adminService.getStores(status)
  }

  @Patch('stores/:id/status')
  updateStoreStatus(@Param('id') id: string, @Body() dto: UpdateStoreStatusDto) {
    return this.adminService.updateStoreStatus(id, dto)
  }

  @Get('users')
  getUsers() {
    return this.adminService.getUsers()
  }

  @Get('orders')
  getOrders(@Query('status') status?: string) {
    return this.adminService.getOrders(status)
  }
}
