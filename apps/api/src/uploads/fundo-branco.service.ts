import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common'
import sharp from 'sharp'
import { UploadsService } from './uploads.service'

/** Lado da foto final, em pixels. Quadrado, para a vitrine ficar uniforme. */
export const LADO_FINAL = 1200
/** Respiro em volta do produto, em fração do lado (cada borda). */
export const MARGEM = 0.08

const BRIA_URL = 'https://engine.prod.bria-api.com/v2/image/edit/remove_background'
const BRIA_TIMEOUT_MS = 45_000
const MAX_RESULTADO_BYTES = 30 * 1024 * 1024

/**
 * Recorta a imagem na área ocupada pelo produto, lendo o canal de transparência.
 *
 * Não usa o `trim()` do sharp de propósito: ele decide o que é "fundo" pelo
 * pixel do canto superior esquerdo. Quando o produto encosta nesse canto — foto
 * bem enquadrada, comum — ele toma o produto por fundo e o resultado sai
 * descentralizado. O teste com o produto no canto pegou exatamente isso.
 *
 * Pixel com alfa até LIMITE conta como vazio, para sombra quase invisível e
 * franja de serrilhado não alargarem a caixa.
 */
async function aparar(png: Buffer): Promise<Buffer> {
  const LIMITE = 8
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .extractChannel('alpha')
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width: w, height: h } = info
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    const linha = y * w
    for (let x = 0; x < w; x++) {
      if (data[linha + x] > LIMITE) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  // Recorte vazio (a Bria não achou nada): segue com a imagem inteira em vez
  // de falhar a foto.
  if (maxX < 0) return png

  return sharp(png)
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png()
    .toBuffer()
}

/**
 * Compõe um recorte (PNG com fundo transparente) sobre fundo branco.
 *
 * O "padrão" que o cliente pediu mora aqui, não na Bria: todas as fotos saem do
 * mesmo tamanho, com o produto centralizado e a mesma margem. A Bria só recorta
 * — ela devolve o recorte do tamanho da foto original, com o produto onde quer
 * que ele estivesse no enquadramento. Por isso o primeiro passo é aparar a
 * transparência em volta: sem isso, um produto fotografado no canto continuaria
 * no canto, só que sobre branco.
 *
 * Exportada separada para dar para testar sem rede.
 */
export async function comporSobreBranco(recortePng: Buffer): Promise<Buffer> {
  const produto = await aparar(recortePng)

  const interno = Math.round(LADO_FINAL * (1 - 2 * MARGEM))
  const encaixado = await sharp(produto)
    .resize(interno, interno, { fit: 'inside' })
    .png()
    .toBuffer()

  return sharp({
    create: {
      width: LADO_FINAL,
      height: LADO_FINAL,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: encaixado, gravity: 'center' }])
    // JPEG: com fundo branco não há transparência a preservar, e o arquivo sai
    // várias vezes menor que o PNG — importa no 4G de quem navega pela vitrine.
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()
}

@Injectable()
export class FundoBrancoService {
  private readonly logger = new Logger(FundoBrancoService.name)

  constructor(private readonly uploads: UploadsService) {}

  /** Sem a chave da Bria o recurso fica desligado e o app esconde o botão. */
  get ativo(): boolean {
    return Boolean(process.env.BRIA_API_TOKEN)
  }

  /**
   * Só aceita foto que já está no NOSSO bucket público.
   *
   * Sem esta trava, o endpoint vira uma porta para fazer o servidor — e a Bria,
   * por nossa conta — buscar qualquer URL da internet. Cada chamada custa
   * dinheiro, e servidor que busca URL arbitrária é a receita clássica de SSRF.
   */
  urlEhNossa(url: string): boolean {
    const base = process.env.SUPABASE_URL
    if (!base || typeof url !== 'string') return false
    const prefixo = `${base.replace(/\/$/, '')}/storage/v1/object/public/product-images/`
    return url.startsWith(prefixo) && !url.includes('..')
  }

  async deixarFundoBranco(urlOriginal: string): Promise<string> {
    if (!this.ativo) {
      throw new BadRequestException('O fundo branco automático não está disponível no momento.')
    }
    if (!this.urlEhNossa(urlOriginal)) {
      throw new BadRequestException('Envie a foto pelo app antes de aplicar o fundo branco.')
    }

    const recorte = await this.recortarNaBria(urlOriginal)
    const final = await comporSobreBranco(recorte)
    return this.uploads.uploadImageBuffer(final, 'image/jpeg')
  }

  private async recortarNaBria(urlImagem: string): Promise<Buffer> {
    const controle = new AbortController()
    const prazo = setTimeout(() => controle.abort(), BRIA_TIMEOUT_MS)

    try {
      const res = await fetch(BRIA_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          api_token: process.env.BRIA_API_TOKEN as string,
        },
        // sync: true segura a conexão até o recorte ficar pronto. O recorte
        // simples leva poucos segundos, então não vale montar fila e webhook.
        body: JSON.stringify({ image: urlImagem, sync: true }),
        signal: controle.signal,
      })

      if (!res.ok) {
        const corpo = (await res.text().catch(() => '')).slice(0, 300)
        this.logger.error(`Bria recusou o recorte (${res.status}): ${corpo}`)
        throw new BadGatewayException(this.mensagemDeErro(res.status))
      }

      const dados = (await res.json()) as { result?: { image_url?: string } }
      const urlRecorte = dados?.result?.image_url
      if (!urlRecorte) {
        this.logger.error('Bria respondeu sem result.image_url')
        throw new BadGatewayException('Não foi possível deixar o fundo branco agora. Tente de novo.')
      }

      return await this.baixar(urlRecorte, controle.signal)
    } catch (err) {
      if (err instanceof BadGatewayException) throw err
      if ((err as Error)?.name === 'AbortError') {
        throw new BadGatewayException('O fundo branco demorou demais. Tente de novo.')
      }
      this.logger.error('Falha ao chamar a Bria', err as Error)
      throw new BadGatewayException('Não foi possível deixar o fundo branco agora. Tente de novo.')
    } finally {
      clearTimeout(prazo)
    }
  }

  private async baixar(url: string, signal: AbortSignal): Promise<Buffer> {
    const res = await fetch(url, { signal })
    if (!res.ok) throw new BadGatewayException('Não foi possível baixar a foto processada.')
    const tamanho = Number(res.headers.get('content-length') ?? 0)
    if (tamanho > MAX_RESULTADO_BYTES) throw new BadGatewayException('A foto processada veio grande demais.')
    return Buffer.from(await res.arrayBuffer())
  }

  /** Erros da Bria traduzidos para o que o lojista consegue resolver. */
  private mensagemDeErro(status: number): string {
    if (status === 415) return 'Formato de foto não suportado. Use JPG, PNG ou WEBP.'
    if (status === 422) return 'Não conseguimos identificar o produto nessa foto. Tente outra, com o produto mais visível.'
    if (status === 429) return 'Muitas fotos ao mesmo tempo. Aguarde um instante e tente de novo.'
    return 'Não foi possível deixar o fundo branco agora. Tente de novo.'
  }
}
