import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'product-images'

/** Detecta o tipo REAL pelo conteúdo (magic bytes), ignorando o MIME do cliente. */
function sniffMime(buf: Buffer): string | null {
  if (!buf || buf.length < 12) return null
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  // GIF: "GIF8"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif'
  // WEBP: "RIFF"...."WEBP"
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  // PDF: "%PDF"
  if (buf.toString('ascii', 0, 4) === '%PDF') return 'application/pdf'
  return null
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name)
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )

  async uploadImage(file: Express.Multer.File): Promise<string> {
    // Valida o conteúdo REAL (magic bytes) — impede subir bytes arbitrários
    // rotulados como image/png. Extensão e content-type vêm do tipo detectado.
    const mime = sniffMime(file.buffer)
    if (!mime) {
      throw new BadRequestException('Arquivo inválido: o conteúdo não é uma imagem/PDF reconhecido.')
    }
    const EXT_BY_MIME: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
      'image/gif': 'gif', 'application/pdf': 'pdf',
    }
    const ext = EXT_BY_MIME[mime]
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const { error } = await this.supabase.storage
      .from(BUCKET)
      .upload(filename, file.buffer, { contentType: mime, upsert: false })

    if (error) {
      // Não vazar detalhes internos do storage ao cliente — só logar no servidor.
      this.logger.error(`Supabase upload failed: ${error.message}`)
      throw new InternalServerErrorException('Não foi possível enviar o arquivo. Tente novamente.')
    }

    const { data } = this.supabase.storage.from(BUCKET).getPublicUrl(filename)
    return data.publicUrl
  }
}
