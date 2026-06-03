import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { FavoritesController } from './favorites.controller'

@Module({
  controllers: [UsersController, FavoritesController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
