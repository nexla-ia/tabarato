import { Equals } from 'class-validator'

export class DeleteAccountDto {
  @Equals('EXCLUIR', { message: 'Digite EXCLUIR para confirmar.' })
  confirm: string
}
