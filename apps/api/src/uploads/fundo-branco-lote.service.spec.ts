import sharp from 'sharp'
import { FundoBrancoLoteService, FOTOS_POR_LOTE } from './fundo-branco-lote.service'
import { FundoBrancoService, LADO_FINAL, pareceFundoBrancoNosso, PREFIXO_FUNDO_BRANCO } from './fundo-branco.service'

const SUPA = 'https://abc.supabase.co'
const BUCKET = `${SUPA}/storage/v1/object/public/product-images/`
const url = (nome: string) => BUCKET + nome

function prismaCom(produtos: { id: string; name: string; imageUrl: string | null; images: string[] }[]) {
  const banco = new Map(produtos.map((p) => [p.id, { ...p, images: [...p.images] }]))
  return {
    banco,
    product: {
      findMany: jest.fn(async () => [...banco.values()].map((p) => ({ ...p, images: [...p.images] }))),
      findUnique: jest.fn(async ({ where }: any) => {
        const p = banco.get(where.id)
        return p ? { imageUrl: p.imageUrl, images: [...p.images] } : null
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const p = banco.get(where.id)!
        Object.assign(p, data)
        return p
      }),
    },
  }
}

function fundoFalso(opts: { falhaEm?: string } = {}) {
  const real = new FundoBrancoService({} as any)
  return {
    ativo: true,
    urlEhNossa: (u: string) => real.urlEhNossa(u),
    ehFotoTratada: (u: string) => real.ehFotoTratada(u),
    tratarFotoAntiga: jest.fn(async (u: string) => {
      if (u === opts.falhaEm) throw new Error('Não conseguimos identificar o produto nessa foto.')
      return { url: url(`${PREFIXO_FUNDO_BRANCO}${u.split('/').pop()}`), cobrada: true }
    }),
  }
}

describe('FundoBrancoLoteService', () => {
  const ORIGINAL = { ...process.env }
  beforeEach(() => { process.env.SUPABASE_URL = SUPA })
  afterEach(() => { process.env = { ...ORIGINAL } })

  it('conta só as fotos sem tratamento, do nosso bucket, sem repetir URL', async () => {
    const prisma = prismaCom([
      { id: 'a', name: 'A', imageUrl: url('1.jpg'), images: [url('2.jpg'), url('fb-3.jpg')] },
      { id: 'b', name: 'B (duplicado de A)', imageUrl: url('1.jpg'), images: [] },
      { id: 'c', name: 'C', imageUrl: 'https://fora.com/x.jpg', images: [] },
    ])
    const svc = new FundoBrancoLoteService(prisma as any, fundoFalso() as any)
    const r = await svc.resumo()
    expect(r.fotos).toBe(2) // 1.jpg (uma vez só) e 2.jpg; fb-3 já tratada
    expect(r.produtos).toBe(2)
    expect(r.ignoradas).toBe(1)
    expect(r.custoMaximoUsd).toBe(0.04)
  })

  it('troca a foto em todos os produtos que usam a mesma URL, e só processa uma vez', async () => {
    const prisma = prismaCom([
      { id: 'a', name: 'A', imageUrl: url('1.jpg'), images: [] },
      { id: 'b', name: 'B', imageUrl: url('9.jpg'), images: [url('1.jpg')] },
    ])
    const fundo = fundoFalso()
    const svc = new FundoBrancoLoteService(prisma as any, fundo as any)
    const r = await svc.processarLote()
    expect(fundo.tratarFotoAntiga).toHaveBeenCalledTimes(2) // 1.jpg e 9.jpg
    expect(prisma.banco.get('a')!.imageUrl).toBe(url('fb-1.jpg'))
    expect(prisma.banco.get('b')!.imageUrl).toBe(url('fb-9.jpg'))
    expect(prisma.banco.get('b')!.images).toEqual([url('fb-1.jpg')])
    expect(r).toMatchObject({ processadas: 2, cobradas: 2, restantes: 0, falhas: [] })
  })

  it('processa no máximo FOTOS_POR_LOTE por chamada e informa quantas faltam', async () => {
    const prisma = prismaCom(Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, imageUrl: url(`${i}.jpg`), images: [] })))
    const svc = new FundoBrancoLoteService(prisma as any, fundoFalso() as any)
    const r = await svc.processarLote()
    expect(r.processadas).toBe(FOTOS_POR_LOTE)
    expect(r.restantes).toBe(5 - FOTOS_POR_LOTE)
  })

  it('foto que falha sai da fila (não trava o lote em loop) até pedir para tentar de novo', async () => {
    const prisma = prismaCom([{ id: 'a', name: 'Garrafa', imageUrl: url('ruim.jpg'), images: [] }])
    const fundo = fundoFalso({ falhaEm: url('ruim.jpg') })
    const svc = new FundoBrancoLoteService(prisma as any, fundo as any)
    const r = await svc.processarLote()
    expect(r.falhas).toEqual([{ produto: 'Garrafa', motivo: expect.stringMatching(/identificar/) }])
    expect(prisma.banco.get('a')!.imageUrl).toBe(url('ruim.jpg')) // nada se perde
    expect((await svc.resumo()).fotos).toBe(0)
    expect((await svc.resumo()).falharam).toBe(1)
    await svc.processarLote({ retentarFalhas: true })
    expect(fundo.tratarFotoAntiga).toHaveBeenCalledTimes(2)
  })

  it('não desfaz o que o lojista mudou enquanto a foto processava', async () => {
    const prisma = prismaCom([{ id: 'a', name: 'A', imageUrl: url('1.jpg'), images: [] }])
    const fundo = fundoFalso()
    fundo.tratarFotoAntiga.mockImplementationOnce(async () => {
      prisma.banco.get('a')!.imageUrl = url('nova-do-lojista.jpg') // editou no meio
      return { url: url('fb-1.jpg'), cobrada: true }
    })
    const svc = new FundoBrancoLoteService(prisma as any, fundo as any)
    await svc.processarLote()
    expect(prisma.banco.get('a')!.imageUrl).toBe(url('nova-do-lojista.jpg'))
  })

  it('automático: processa a fila inteira, lote atrás de lote, sem ninguém apertar nada', async () => {
    const prisma = prismaCom(Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, imageUrl: url(`${i}.jpg`), images: [] })))
    const fundo = fundoFalso()
    const svc = new FundoBrancoLoteService(prisma as any, fundo as any)
    await svc.processarTudo()
    expect(fundo.tratarFotoAntiga).toHaveBeenCalledTimes(7)
    expect((await svc.resumo()).fotos).toBe(0)
  })

  it('agendar sem a chave da Bria não faz nada', () => {
    const prisma = prismaCom([{ id: 'a', name: 'A', imageUrl: url('1.jpg'), images: [] }])
    const svc = new FundoBrancoLoteService(prisma as any, { ...fundoFalso(), ativo: false } as any)
    svc.agendar()
    expect(prisma.product.findMany).not.toHaveBeenCalled()
  })

  it('sem a chave da Bria, recusa rodar', async () => {
    const svc = new FundoBrancoLoteService(prismaCom([]) as any, { ...fundoFalso(), ativo: false } as any)
    await expect(svc.processarLote()).rejects.toThrow(/BRIA_API_TOKEN/)
  })
})

describe('foto já tratada antes do prefixo', () => {
  it('JPEG 1200×1200 com cantos brancos é reconhecida (não paga a Bria de novo)', async () => {
    const nossa = await sharp({ create: { width: LADO_FINAL, height: LADO_FINAL, channels: 3, background: '#ffffff' } })
      .composite([{ input: await sharp({ create: { width: 400, height: 400, channels: 3, background: '#c00' } }).png().toBuffer(), gravity: 'center' }])
      .jpeg().toBuffer()
    expect(await pareceFundoBrancoNosso(nossa)).toBe(true)
  })

  it('foto comum do celular não é confundida', async () => {
    const comum = await sharp({ create: { width: 1200, height: 1600, channels: 3, background: '#887766' } }).jpeg().toBuffer()
    const quadradaColorida = await sharp({ create: { width: LADO_FINAL, height: LADO_FINAL, channels: 3, background: '#887766' } }).jpeg().toBuffer()
    expect(await pareceFundoBrancoNosso(comum)).toBe(false)
    expect(await pareceFundoBrancoNosso(quadradaColorida)).toBe(false)
  })

  it('tratarFotoAntiga: já tratada só regrava com o prefixo, sem chamar a Bria', async () => {
    process.env.SUPABASE_URL = SUPA
    process.env.BRIA_API_TOKEN = 'tok'
    const nossa = await sharp({ create: { width: LADO_FINAL, height: LADO_FINAL, channels: 3, background: '#ffffff' } }).jpeg().toBuffer()
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(new Uint8Array(nossa), { status: 200 }))
    const uploads = { uploadImageBuffer: jest.fn().mockResolvedValue(url('fb-x.jpg')) }
    const svc = new FundoBrancoService(uploads as any)
    const r = await svc.tratarFotoAntiga(url('antiga.jpg'))
    expect(r).toEqual({ url: url('fb-x.jpg'), cobrada: false })
    expect(fetchMock).toHaveBeenCalledTimes(1) // só baixou a foto; Bria não foi chamada
    expect(uploads.uploadImageBuffer.mock.calls[0][2]).toBe(PREFIXO_FUNDO_BRANCO)
    fetchMock.mockRestore()
  })
})
