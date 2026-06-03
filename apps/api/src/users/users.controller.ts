import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { UsersService } from './users.service'
import { UpdateUserDto } from './dto/update-user.dto'
import { CreateAddressDto } from './dto/create-address.dto'

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: any) {
    return this.usersService.findById(user.sub)
  }

  @Get('me/referral')
  async getReferral(@CurrentUser() user: any) {
    const u = await this.usersService.findById(user.sub)
    return {
      referralCode: (u as any).referralCode,
      shareText: `Use meu código ${(u as any).referralCode} no Tá Barato e ganhe 50 pontos de boas-vindas! 🎁`,
    }
  }

  @Patch('me')
  updateMe(@CurrentUser() user: any, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user.sub, dto)
  }

  @Put('me/push-token')
  updatePushToken(@CurrentUser() user: any, @Body('token') token: string) {
    return this.usersService.updatePushToken(user.sub, token)
  }

  @Get('me/addresses')
  getAddresses(@CurrentUser() user: any) {
    return this.usersService.listAddresses(user.sub)
  }

  @Post('me/addresses')
  addAddress(@CurrentUser() user: any, @Body() dto: CreateAddressDto) {
    return this.usersService.addAddress(user.sub, dto)
  }

  @Patch('me/addresses/:id')
  updateAddress(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreateAddressDto,
  ) {
    return this.usersService.updateAddress(user.sub, id, dto)
  }

  @Delete('me/addresses/:id')
  deleteAddress(@CurrentUser() user: any, @Param('id') id: string) {
    return this.usersService.deleteAddress(user.sub, id)
  }
}
