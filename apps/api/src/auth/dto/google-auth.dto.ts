import { IsString } from 'class-validator'

export class GoogleAuthDto {
  // ID token retornado pelo Google Sign-In no app.
  @IsString()
  idToken: string
}
