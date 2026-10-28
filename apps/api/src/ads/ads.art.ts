import sharp from 'sharp'

/** Tamanho final da arte na vitrine: 3:1, igual ao card do carrossel. */
export const ARTE_LARGURA = 1200
export const ARTE_ALTURA = 400

// Perto de 3:1 a arte é cortada para preencher (cover) — perde só uma faixa da borda.
// Fora disso (post quadrado do Instagram, foto em pé) cortar comeria o conteúdo:
// a arte vai inteira no meio, sobre uma versão desfocada dela mesma.
const PROPORCAO_MIN = 2.2
const PROPORCAO_MAX = 4
// Quanto dá para ampliar antes de ficar borrada no celular.
const AMPLIACAO_MAX = 2

export class ArteInvalida extends Error {}

export async function normalizarArte(entrada: Buffer): Promise<Buffer> {
  let width: number | undefined
  let height: number | undefined
  try {
    // rotate() antes de medir: foto de celular vem deitada com orientação no EXIF.
    const girada = await sharp(entrada).rotate().toBuffer({ resolveWithObject: true })
    entrada = girada.data
    width = girada.info.width
    height = girada.info.height
  } catch {
    throw new ArteInvalida('Não conseguimos abrir essa imagem. Envie um JPG ou PNG.')
  }
  if (!width || !height) throw new ArteInvalida('Não conseguimos ler o tamanho da imagem.')

  const proporcao = width / height
  const preencher = proporcao >= PROPORCAO_MIN && proporcao <= PROPORCAO_MAX
  const ampliacao = preencher
    ? Math.max(ARTE_LARGURA / width, ARTE_ALTURA / height)
    : Math.min(ARTE_LARGURA / width, ARTE_ALTURA / height)
  if (ampliacao > AMPLIACAO_MAX) {
    throw new ArteInvalida(
      `A imagem é pequena demais (${width} × ${height}) e ficaria borrada. Envie uma maior — o ideal é ${ARTE_LARGURA} × ${ARTE_ALTURA} px.`,
    )
  }

  if (preencher) {
    return sharp(entrada)
      .resize(ARTE_LARGURA, ARTE_ALTURA, { fit: 'cover', position: 'centre' })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer()
  }

  const fundo = await sharp(entrada)
    .resize(ARTE_LARGURA, ARTE_ALTURA, { fit: 'cover' })
    .flatten({ background: '#ffffff' })
    .blur(28)
    .modulate({ brightness: 0.8 })
    .toBuffer()
  const frente = await sharp(entrada)
    .resize(ARTE_LARGURA, ARTE_ALTURA, { fit: 'inside' })
    .toBuffer()
  return sharp(fundo)
    .composite([{ input: frente, gravity: 'centre' }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer()
}
