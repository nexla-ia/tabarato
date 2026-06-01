import { IsEnum } from 'class-validator'

export class UpdateCourierDocStatusDto {
  @IsEnum(['cnh', 'identity', 'vehicle'])
  document: 'cnh' | 'identity' | 'vehicle'

  @IsEnum(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED'
}
