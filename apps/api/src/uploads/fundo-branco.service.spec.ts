import { BadGatewayException, BadRequestException } from '@nestjs/common'
import sharp from 'sharp'
import { comporSobreBranco, FundoBrancoService, LADO_FINAL } from './fundo-branco.service'

/**
 * Recorte sintético: tela transparente 800x600 com um quadrado vermelho
 * encostado no CANTO superior esquerdo. É o caso que importa — produto
 * fotografado fora do centro tem que sair centralizado.
 */
async function recorteNoCanto(): Promise<Buffer> {
  const quadrado = await sharp({
    create: { width: 200, height: 200, channels: 4, background: { r: 220, g: 0, b: 0, alpha: 1 } },
  }).png().toBuffer()

  return sharp({
    create: { width: 800, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: quadrado, left: 0, top: 0 }])
    .png()
    .toBuffer()
}

async function pixel(img: Buffer, x: number, y: number) {
  const { data, info } = await sharp(img).raw().toBuffer({ resolveWithObject: true })
  const i = (y * info.width + x) * info.channels
  return { r: data[i], g: data[i + 1], b: data[i + 2] }
}

describe('comporSobreBranco — o padrão da vitrine', () => {
  it('sai quadrado, no tamanho fixo e em JPEG', async () => {
    const out = await comporSobreBranco(await recorteNoCanto())
    const meta = await sharp(out).metadata()

    expect(meta.format).toBe('jpeg')
    expect(meta.width).toBe(LADO_FINAL)
    expect(meta.height).toBe(LADO_FINAL)
  })

  it('fundo branco nas bordas', async () => {
    const out = await comporSobreBranco(await recorteNoCanto())
    const canto = await pixel(out, 5, 5)

    expect(canto.r).toBeGreaterThan(245)
    expect(canto.g).toBeGreaterThan(245)
    expect(canto.b).toBeGreaterThan(245)
  })

  it('produto fotografado no canto sai CENTRALIZADO', async () => {
    const out = await comporSobreBranco(await recorteNoCanto())
    const centro = await pixel(out, LADO_FINAL / 2, LADO_FINAL / 2)

    // Vermelho no meio = a transparência em volta foi aparada antes de encaixar.
    expect(centro.r).toBeGreaterThan(180)
    expect(centro.g).toBeLessThan(60)
    expect(centro.b).toBeLessThan(60)
  })

  it('recorte vazio (todo transparente) não derruba a foto', async () => {
    const vazio = await sharp({
      create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer()

    const out = await comporSobreBranco(vazio)
    expect((await sharp(out).metadata()).width).toBe(LADO_FINAL)
  })
})

describe('FundoBrancoService', () => {
  const ORIGINAL = { ...process.env }
  const SUPA = 'https://abc.supabase.co'
  const URL_NOSSA = `${SUPA}/storage/v1/object/public/product-images/123-foto.jpg`
  let uploads: { uploadImageBuffer: jest.Mock }
  let svc: FundoBrancoService

  beforeEach(() => {
    process.env.SUPABASE_URL = SUPA
    process.env.BRIA_API_TOKEN = 'tok'
    uploads = { uploadImageBuffer: jest.fn().mockResolvedValue(`${SUPA}/final.jpg`) }
    svc = new FundoBrancoService(uploads as any)
  })

  afterEach(() => {
    process.env = { ...ORIGINAL }
    jest.restoreAllMocks()
  })

  it('sem a chave da Bria, o recurso fica desligado', async () => {
    delete process.env.BRIA_API_TOKEN
    expect(svc.ativo).toBe(false)
    await expect(svc.deixarFundoBranco(URL_NOSSA)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('recusa URL de fora do nosso bucket (sem gastar crédito na Bria)', async () => {
    const espiao = jest.spyOn(global, 'fetch')

    for (const url of [
      'https://site-qualquer.com/foto.jpg',
      `${SUPA}/storage/v1/object/public/outro-bucket/x.jpg`,
      `${SUPA}/storage/v1/object/public/product-images/../segredo`,
    ]) {
      await expect(svc.deixarFundoBranco(url)).rejects.toBeInstanceOf(BadRequestException)
    }
    expect(espiao).not.toHaveBeenCalled()
  })

  it('caminho feliz: recorta na Bria, compõe e salva', async () => {
    const recorte = await recorteNoCanto()
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { image_url: 'https://bria/out.png' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array(recorte), { status: 200 }))

    const url = await svc.deixarFundoBranco(URL_NOSSA)

    // Chamada à Bria: endpoint, header e corpo certos.
    const [endpoint, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(endpoint).toContain('/v2/image/edit/remove_background')
    expect((opts.headers as Record<string, string>).api_token).toBe('tok')
    expect(JSON.parse(opts.body as string)).toEqual({ image: URL_NOSSA, sync: true })

    // Salvou um JPEG composto, e devolveu a URL dele.
    const [buf, mime] = uploads.uploadImageBuffer.mock.calls[0]
    expect(mime).toBe('image/jpeg')
    expect((await sharp(buf).metadata()).width).toBe(LADO_FINAL)
    expect(url).toBe(`${SUPA}/final.jpg`)
  })

  it('Bria não acha o produto (422) → mensagem que o lojista entende', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 422 }))

    await expect(svc.deixarFundoBranco(URL_NOSSA)).rejects.toThrow(/identificar o produto/)
    expect(uploads.uploadImageBuffer).not.toHaveBeenCalled()
  })

  it('Bria responde sem a URL do resultado → falha limpa, nada salvo', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('{"result":{}}', { status: 200 }))

    await expect(svc.deixarFundoBranco(URL_NOSSA)).rejects.toBeInstanceOf(BadGatewayException)
    expect(uploads.uploadImageBuffer).not.toHaveBeenCalled()
  })
})
