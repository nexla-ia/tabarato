import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { createClient } from '@supabase/supabase-js'

// Bucket PÚBLICO — fotos de produto, logos, avatares, comprovante de entrega.
const IMAGE_BUCKET = 'product-images'
// Bucket PRIVADO — documentos de identidade do entregador (CNH, RG, doc. do veículo).
// Nunca deve ter leitura pública: o acesso é só via signed URL de curta duração,
// gerada sob demanda para o admin conferir. É PII sensível (LGPD).
const DOC_BUCKET = 'courier-documents'

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'application/pdf': 'pdf',
}

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
  // Garante o bucket privado só uma vez por processo (memoiza a promise).
  private docBucketReady: Promise<void> | null = null

  /** Valida o conteúdo real e devolve { mime, filename } — ou lança 400. */
  private sniffAndName(file: Express.Multer.File): { mime: string; filename: string } {
    const mime = sniffMime(file.buffer)
    if (!mime) {
      throw new BadRequestException('Arquivo inválido: o conteúdo não é uma imagem/PDF reconhecido.')
    }
    const ext = EXT_BY_MIME[mime]
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    return { mime, filename }
  }

  async uploadImage(file: Express.Multer.File): Promise<string> {
    // Valida o conteúdo REAL (magic bytes) — impede subir bytes arbitrários
    // rotulados como image/png. Extensão e content-type vêm do tipo detectado.
    const { mime, filename } = this.sniffAndName(file)

    const { error } = await this.supabase.storage
      .from(IMAGE_BUCKET)
      .upload(filename, file.buffer, { contentType: mime, upsert: false })

    if (error) {
      // Não vazar detalhes internos do storage ao cliente — só logar no servidor.
      this.logger.error(`Supabase upload failed: ${error.message}`)
      throw new InternalServerErrorException('Não foi possível enviar o arquivo. Tente novamente.')
    }

    const { data } = this.supabase.storage.from(IMAGE_BUCKET).getPublicUrl(filename)
    return data.publicUrl
  }

  /**
   * Sobe um DOCUMENTO do entregador para o bucket PRIVADO e devolve só o PATH
   * (não uma URL pública). O admin vê via signed URL gerada em signDocuments().
   */
  async uploadDocument(file: Express.Multer.File): Promise<string> {
    const { mime, filename } = this.sniffAndName(file)
    await this.ensureDocBucket()

    const { error } = await this.supabase.storage
      .from(DOC_BUCKET)
      .upload(filename, file.buffer, { contentType: mime, upsert: false })

    if (error) {
      this.logger.error(`Supabase document upload failed: ${error.message}`)
      throw new InternalServerErrorException('Não foi possível enviar o documento. Tente novamente.')
    }
    return filename
  }

  /**
   * Recebe uma lista de valores gravados em cnhPhotoUrl/identityPhotoUrl/... e
   * devolve um mapa valor→URL exibível. Paths privados viram signed URL de 1h;
   * valores http(s) legados (bucket público antigo) passam direto.
   */
  async signDocuments(values: (string | null | undefined)[], expiresIn = 3600): Promise<Record<string, string>> {
    const out: Record<string, string> = {}
    const toSign: string[] = []
    for (const v of values) {
      if (!v) continue
      if (/^https?:\/\//i.test(v)) { out[v] = v; continue } // legado/público
      if (!toSign.includes(v)) toSign.push(v)
    }
    if (toSign.length === 0) return out
    try {
      const { data, error } = await this.supabase.storage.from(DOC_BUCKET).createSignedUrls(toSign, expiresIn)
      if (error) { this.logger.warn(`createSignedUrls failed: ${error.message}`); return out }
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) out[item.path] = item.signedUrl
      }
    } catch (e: any) {
      this.logger.warn(`createSignedUrls threw: ${e?.message ?? e}`)
    }
    return out
  }

  /** Cria o bucket privado se ainda não existir (idempotente, uma vez por processo). */
  private ensureDocBucket(): Promise<void> {
    if (!this.docBucketReady) {
      this.docBucketReady = (async () => {
        const { data } = await this.supabase.storage.getBucket(DOC_BUCKET)
        if (data) return
        const { error } = await this.supabase.storage.createBucket(DOC_BUCKET, { public: false })
        // Corrida entre instâncias: "já existe" é sucesso.
        if (error && !/exist/i.test(error.message)) {
          this.logger.error(`createBucket(${DOC_BUCKET}) failed: ${error.message}`)
          throw new InternalServerErrorException('Não foi possível preparar o armazenamento de documentos.')
        }
      })().catch((e) => { this.docBucketReady = null; throw e })
    }
    return this.docBucketReady
  }
}
