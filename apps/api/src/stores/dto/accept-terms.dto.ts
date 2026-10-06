import { IsString, MaxLength } from 'class-validator'

export class AcceptTermsDto {
  /** Versao do texto exibido na tela em que o lojista clicou em aceitar. */
  @IsString()
  @MaxLength(20)
  version: string
}
