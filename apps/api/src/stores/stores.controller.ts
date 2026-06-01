import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.storesService.findById(id)
  }
}
