import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, Query } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { ProductsService } from './products.service'
import { CreateProductDto } from './dto/create-product.dto'
import { CreateVariationDto } from './dto/create-variation.dto'
import { BulkToggleDto, BulkUpdateDto } from './dto/bulk-product.dto'

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('popular')
  getPopular(@Query('limit') limit?: string) {
    // Clamp: limit vira `take` no Prisma; sem teto/validação seria DoS (e NaN → 500).
    const n = parseInt(limit ?? '', 10)
    const safeLimit = Math.min(Math.max(1, Number.isFinite(n) ? n : 12), 50)
    return this.productsService.findPopular(safeLimit)
  }

  // Listagem geral de produtos (home focada em itens). Filtra por categoria da loja e busca.
  @Get()
  findAll(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    const n = parseInt(limit ?? '', 10)
    return this.productsService.findAll({
      categoryId: categoryId || undefined,
      search: search?.trim() || undefined,
      limit: Number.isFinite(n) ? n : undefined,
    })
  }

  @Get('store/:storeId')
  findByStore(@Param('storeId') storeId: string) {
    return this.productsService.findByStore(storeId)
  }

  // Must be before :id to avoid route conflict
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Get('my')
  findMy(@CurrentUser() user: any) {
    return this.productsService.findMy(user.sub)
  }

  // Must be before :id to avoid route conflict
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Patch('variations/:variationId/toggle')
  toggleVariation(@CurrentUser() user: any, @Param('variationId') variationId: string) {
    return this.productsService.toggleVariation(user.sub, variationId)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Patch('variations/:variationId')
  updateVariation(
    @CurrentUser() user: any,
    @Param('variationId') variationId: string,
    @Body() dto: CreateVariationDto,
  ) {
    return this.productsService.updateVariation(user.sub, variationId, dto)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Delete('variations/:variationId')
  removeVariation(@CurrentUser() user: any, @Param('variationId') variationId: string) {
    return this.productsService.removeVariation(user.sub, variationId)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Get(':id/variations')
  getVariations(@CurrentUser() user: any, @Param('id') id: string) {
    return this.productsService.getVariations(user.sub, id)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findById(id)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Post('store/:storeId')
  create(
    @CurrentUser() user: any,
    @Param('storeId') storeId: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(user.sub, storeId, dto)
  }

  // Must be before :id to avoid NestJS matching :id = 'toggle'
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Patch(':id/toggle')
  toggleActive(@CurrentUser() user: any, @Param('id') id: string) {
    return this.productsService.toggleActive(user.sub, id)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Patch(':id')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.update(user.sub, id, dto)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.productsService.remove(user.sub, id)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Post(':id/variations')
  addVariation(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreateVariationDto,
  ) {
    return this.productsService.addVariation(user.sub, id, dto)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: any, @Param('id') id: string) {
    return this.productsService.duplicate(user.sub, id)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Patch('bulk/toggle')
  bulkToggle(@CurrentUser() user: any, @Body() body: BulkToggleDto) {
    return this.productsService.bulkToggle(user.sub, body.productIds, body.active)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Patch('bulk/update')
  bulkUpdate(@CurrentUser() user: any, @Body() body: BulkUpdateDto) {
    const { productIds, ...data } = body
    return this.productsService.bulkUpdate(user.sub, productIds, data)
  }
}
