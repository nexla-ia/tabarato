import { IsIn, IsString, MaxLength } from 'class-validator'

export class ResubmitDocumentDto {
  // Qual documento está sendo reenviado após reprovação.
  @IsIn(['cnh', 'identity', 'vehicle'])
  document: 'cnh' | 'identity' | 'vehicle'

  // PATH retornado pelo /uploads/document (bucket privado). Não é URL pública.
  @IsString()
  @MaxLength(500)
  url: string
}
