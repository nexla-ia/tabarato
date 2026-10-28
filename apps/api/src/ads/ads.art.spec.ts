import sharp from 'sharp'
import { ARTE_ALTURA, ARTE_LARGURA, ArteInvalida, normalizarArte } from './ads.art'

const imagem = (w: number, h: number, cor = '#ff6600') =>
  sharp({ create: { width: w, height: h, channels: 3, background: cor } }).png().toBuffer()

async function tamanho(buf: Buffer) {
  const meta = await sharp(buf).metadata()
  return { formato: meta.format, dims: [meta.width, meta.height] }
}

describe('normalizarArte', () => {
  it('deixa a arte em 1200 × 400 JPEG', async () => {
    expect(await tamanho(await normalizarArte(await imagem(1500, 500)))).toEqual({
      formato: 'jpeg', dims: [ARTE_LARGURA, ARTE_ALTURA],
    })
  })

  it('perto de 3:1, corta o excesso e preenche tudo', async () => {
    const out = await normalizarArte(await imagem(1000, 400))
    expect((await tamanho(out)).dims).toEqual([ARTE_LARGURA, ARTE_ALTURA])
    // Canto com a cor da arte: não sobrou faixa de fundo.
    const { data } = await sharp(out).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
    expect(data[0]).toBeGreaterThan(230)
  })

  it('post quadrado vai inteiro no meio, sem cortar', async () => {
    // Quadrado verde: o centro tem que ser verde e as laterais, fundo desfocado (mais escuro).
    const out = await normalizarArte(await imagem(1080, 1080, '#00c000'))
    expect((await tamanho(out)).dims).toEqual([ARTE_LARGURA, ARTE_ALTURA])
    const px = async (left: number) =>
      (await sharp(out).extract({ left, top: 200, width: 1, height: 1 }).raw().toBuffer())
    const centro = await px(600)
    const lateral = await px(5)
    expect(centro[1]).toBeGreaterThan(170)
    expect(lateral[1]).toBeLessThan(centro[1])
  })

  it('recusa imagem pequena demais (ficaria borrada)', async () => {
    await expect(normalizarArte(await imagem(450, 150))).rejects.toThrow(/pequena demais/)
    await expect(normalizarArte(await imagem(150, 150))).rejects.toBeInstanceOf(ArteInvalida)
  })

  it('recusa arquivo que não é imagem', async () => {
    await expect(normalizarArte(Buffer.from('nao sou imagem'))).rejects.toBeInstanceOf(ArteInvalida)
  })
})
