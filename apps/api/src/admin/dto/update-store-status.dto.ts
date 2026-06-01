import { IsEnum, IsOptional, IsString } from 'class-validator'

export enum StoreStatusUpdate {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}

export class UpdateStoreStatusDto {
  @IsEnum(StoreStatusUpdate)
  status: StoreStatusUpdate

  @IsOptional()
  @IsString()
  note?: string
}
