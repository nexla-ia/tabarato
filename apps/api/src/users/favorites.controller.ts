import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { PrismaService } from '../prisma/prisma.service'

@UseGuards(JwtAuthGuard)
@Controller('users/me/favorites')
export class FavoritesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: any) {
    return this.prisma.favorite.findMany({
      where: { userId: user.sub },
      include: {
        store: {
          include: { categories: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  @Post(':storeId')
  async add(@CurrentUser() user: any, @Param('storeId') storeId: string) {
    return this.prisma.favorite.upsert({
      where: { userId_storeId: { userId: user.sub, storeId } },
      create: { userId: user.sub, storeId },
      update: {},
    })
  }

  @Delete(':storeId')
  async remove(@CurrentUser() user: any, @Param('storeId') storeId: string) {
    await this.prisma.favorite.deleteMany({
      where: { userId: user.sub, storeId },
    })
    return { ok: true }
  }

  @Get('ids')
  async listIds(@CurrentUser() user: any) {
    const favs = await this.prisma.favorite.findMany({
      where: { userId: user.sub },
      select: { storeId: true },
    })
    return favs.map(f => f.storeId)
  }
}
