import { IsBoolean } from 'class-validator'

export class UpdateUserStatusDto {
  /** false = conta desativada (perde acesso no proximo request). */
  @IsBoolean()
  isActive: boolean
}
