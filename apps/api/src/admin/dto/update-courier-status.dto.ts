import { IsEnum, IsOptional, IsString } from 'class-validator'

export enum CourierStatusUpdate {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}

export class UpdateCourierStatusDto {
  @IsEnum(CourierStatusUpdate)
  status: CourierStatusUpdate

  @IsOptional()
  @IsString()
  note?: string
}
