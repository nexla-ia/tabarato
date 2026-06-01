import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'product-images'

@Injectable()
export class UploadsService {
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  )

  async uploadImage(file: Express.Multer.File): Promise<string> {
    const ext = file.originalname.split('.').pop() ?? 'jpg'
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const { error } = await this.supabase.storage
      .from(BUCKET)
      .upload(filename, file.buffer, { contentType: file.mimetype, upsert: false })

    if (error) throw new InternalServerErrorException(error.message)

    const { data } = this.supabase.storage.from(BUCKET).getPublicUrl(filename)
    return data.publicUrl
  }
}
