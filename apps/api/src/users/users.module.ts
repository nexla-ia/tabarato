import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { FavoritesController } from './favorites.controller'
import { AccountDeletionService } from './account-deletion.service'

@Module({
  controllers: [UsersController, FavoritesController],
  providers: [UsersService, AccountDeletionService],
  exports: [UsersService],
})
export class UsersModule {}
