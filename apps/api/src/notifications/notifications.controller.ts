import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { CurrentUser } from '../common/decorators/current-user.decorator'
import { NotificationsService } from './notifications.service'

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  getAll(@CurrentUser() user: any) {
    return this.notificationsService.findByUser(user.sub)
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: any) {
    return this.notificationsService.unreadCount(user.sub).then((count) => ({ count }))
  }

  @Patch('read-all')
  readAll(@CurrentUser() user: any) {
    return this.notificationsService.markAllRead(user.sub)
  }

  @Patch(':id/read')
  readOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notificationsService.markRead(id, user.sub)
  }
}
