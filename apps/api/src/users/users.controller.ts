import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { UsersService } from './users.service'
import { UpdateUserDto } from './dto/update-user.dto'
import { CreateAddressDto } from './dto/create-address.dto'
import { PushTokenDto } from './dto/push-token.dto'
import { ChangePasswordDto } from './dto/change-password.dto'
import { BibleOfferDto } from './dto/bible-offer.dto'
import { DeleteAccountDto } from './dto/delete-account.dto'
import { AccountDeletionService } from './account-deletion.service'

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly exclusao: AccountDeletionService,
  ) {}

  /** O app mostra isto ANTES do botão final: o que impede excluir agora. */
  @Get('me/deletion-check')
  deletionCheck(@CurrentUser() user: any) {
    return this.exclusao.impedimentos(user.sub).then((motivos) => ({ canDelete: motivos.length === 0, motivos }))
  }

  // Exclusão da própria conta (App Store 5.1.1(v) / Google Play). Pede a palavra
  // EXCLUIR digitada: confirmação explícita sem depender de senha, que quem
  // entrou com Google ou Apple não tem.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Delete('me')
  deleteMe(@CurrentUser() user: any, @Body() _dto: DeleteAccountDto) {
    return this.exclusao.excluir(user.sub)
  }

  @Get('me')
  getMe(@CurrentUser() user: any) {
    return this.usersService.findById(user.sub)
  }

  @Get('me/referral')
  async getReferral(@CurrentUser() user: any) {
    const referralCode = await this.usersService.ensureReferralCode(user.sub)
    return {
      referralCode,
      shareText: `Use meu código ${referralCode} no Tá Barato e ganhe 50 pontos de boas-vindas! 🎁`,
    }
  }

  @Patch('me')
  updateMe(@CurrentUser() user: any, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user.sub, dto)
  }

  @Put('me/push-token')
  updatePushToken(@CurrentUser() user: any, @Body() dto: PushTokenDto) {
    return this.usersService.updatePushToken(user.sub, dto.token)
  }

  // Limite contra brute-force de senha atual: 8 tentativas por minuto por usuário.
  @Throttle({ default: { ttl: 60_000, limit: 8 } })
  @Patch('me/password')
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(user.sub, dto)
  }

  // Resposta à oferta da Bíblia de cortesia (ver users.service.answerBibleOffer).
  @Post('me/bible-offer')
  answerBibleOffer(@CurrentUser() user: any, @Body() dto: BibleOfferDto) {
    return this.usersService.answerBibleOffer(user.sub, dto.accepted)
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
