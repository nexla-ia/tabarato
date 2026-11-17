import { BadRequestException, ConflictException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { FundoBrancoService } from './fundo-branco.service'

/** Preço da Bria por foto (levantado em 22/10/2026). Só para a estimativa na tela. */
export const CUSTO_POR_FOTO_USD = 0.018
/**
 * Fotos por chamada. Cada uma leva alguns segundos na Bria; poucas por vez
 * mantêm a requisição bem abaixo do tempo limite do proxy, e a tela do admin
 * vai chamando de novo até acabar.
 */
export const FOTOS_POR_LOTE = 3
/** De quanto em quanto tempo confere se sobrou foto sem tratamento. */
const INTERVALO_MS = 5 * 60_000

interface Pendente {
  url: string
  produtos: { id: string; nome: string }[]
}

/**
 * Garante o padrão da vitrine: TODA foto de produto fica com fundo branco, sem
 * opção para o lojista. O app e o site já tratam a foto no envio; isto aqui é a
 * garantia no servidor — pega o que chegou sem tratar (APK antigo, foto de antes
 * de ficar automático) e processa sozinho, em segundo plano.
 *
 * Dispara ao salvar um produto (`agendar`), alguns segundos depois de a API
 * subir e a cada INTERVALO_MS. Usa a chave da Bria das variáveis do servidor.
 */
@Injectable()
export class FundoBrancoLoteService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FundoBrancoLoteService.name)
  private rodando = false
  /** Laço em segundo plano rodando (pode ter vários lotes seguidos). */
  private emSegundoPlano = false
  /** Pediram de novo enquanto o laço rodava: roda mais uma vez no fim. */
  private deNovo = false
  private timer?: ReturnType<typeof setInterval>
  /** Fotos que deram erro: saem da fila até o admin pedir para tentar de novo. */
  private readonly falharam = new Map<string, string>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly fundo: FundoBrancoService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return
    this.timer = setInterval(() => this.agendar(), INTERVALO_MS)
    this.timer.unref?.()
    setTimeout(() => this.agendar(), 20_000).unref?.()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  /** Processa em segundo plano tudo o que estiver sem fundo branco. Não espera. */
  agendar(): void {
    if (!this.fundo.ativo) return
    if (this.emSegundoPlano) { this.deNovo = true; return }
    this.emSegundoPlano = true
    void this.processarTudo().finally(() => {
      this.emSegundoPlano = false
      if (this.deNovo) { this.deNovo = false; this.agendar() }
    })
  }

  /** Lotes seguidos até a fila esvaziar (ou um lote não andar). */
  async processarTudo() {
    for (;;) {
      try {
        const r = await this.processarLote()
        if (r.restantes === 0 || r.processadas + r.falhas.length === 0) return
      } catch (err) {
        this.logger.error('Fundo branco automático parou', err as Error)
        return
      }
    }
  }

  /**
   * Fila de fotos sem tratamento. A mesma URL pode estar em mais de um produto
   * (produto duplicado copia as fotos): ela é processada UMA vez e trocada em todos.
   */
  private async fila(): Promise<{ pendentes: Pendente[]; ignoradas: number }> {
    const produtos = await this.prisma.product.findMany({
      where: { OR: [{ imageUrl: { not: null } }, { images: { isEmpty: false } }] },
      select: { id: true, name: true, imageUrl: true, images: true },
      orderBy: { createdAt: 'asc' },
    })

    const porUrl = new Map<string, Pendente>()
    const foraDoBucket = new Set<string>()
    for (const p of produtos) {
      const urls = new Set([p.imageUrl, ...(p.images ?? [])].filter((u): u is string => !!u))
      for (const url of urls) {
        if (this.fundo.ehFotoTratada(url) || this.falharam.has(url)) continue
        if (!this.fundo.urlEhNossa(url)) { foraDoBucket.add(url); continue }
        const item = porUrl.get(url) ?? { url, produtos: [] }
        item.produtos.push({ id: p.id, nome: p.name })
        porUrl.set(url, item)
      }
    }
    return { pendentes: [...porUrl.values()], ignoradas: foraDoBucket.size }
  }

  async resumo() {
    const { pendentes, ignoradas } = await this.fila()
    const produtos = new Set(pendentes.flatMap((p) => p.produtos.map((x) => x.id))).size
    return {
      ativo: this.fundo.ativo,
      rodando: this.rodando || this.emSegundoPlano,
      fotos: pendentes.length,
      produtos,
      ignoradas,
      falharam: this.falharam.size,
      // Teto: foto que já estava com fundo branco (de antes do prefixo) sai de graça.
      custoMaximoUsd: Math.round(pendentes.length * CUSTO_POR_FOTO_USD * 100) / 100,
    }
  }

  async processarLote(opts: { retentarFalhas?: boolean } = {}) {
    if (!this.fundo.ativo) {
      throw new BadRequestException('Falta a BRIA_API_TOKEN nas variáveis do servidor.')
    }
    if (this.rodando) {
      throw new ConflictException('Já tem um lote rodando. Espere terminar.')
    }
    this.rodando = true
    try {
      if (opts.retentarFalhas) this.falharam.clear()
      const { pendentes } = await this.fila()
      const agora = pendentes.slice(0, FOTOS_POR_LOTE)

      const resultados = await Promise.all(agora.map(async (item) => {
        try {
          const r = await this.fundo.tratarFotoAntiga(item.url)
          for (const p of item.produtos) await this.trocarUrl(p.id, item.url, r.url)
          return { ok: true as const, cobrada: r.cobrada }
        } catch (err) {
          const motivo = (err as Error)?.message || 'Erro desconhecido'
          this.falharam.set(item.url, motivo)
          this.logger.warn(`Fundo branco falhou em ${item.url}: ${motivo}`)
          return { ok: false as const, produto: item.produtos[0]?.nome ?? 'Produto', motivo }
        }
      }))

      return {
        processadas: resultados.filter((r) => r.ok).length,
        cobradas: resultados.filter((r) => r.ok && r.cobrada).length,
        falhas: resultados.flatMap((r) => (r.ok ? [] : [{ produto: r.produto, motivo: r.motivo }])),
        restantes: pendentes.length - agora.length,
      }
    } finally {
      this.rodando = false
    }
  }

  /**
   * Troca a foto no produto. Relê antes de gravar: o lojista pode ter mexido no
   * produto enquanto a foto processava, e o que ele fez não pode ser desfeito.
   */
  private async trocarUrl(productId: string, antiga: string, nova: string) {
    const p = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { imageUrl: true, images: true },
    })
    if (!p) return
    const data: { imageUrl?: string; images?: string[] } = {}
    if (p.imageUrl === antiga) data.imageUrl = nova
    if (p.images?.includes(antiga)) data.images = p.images.map((u) => (u === antiga ? nova : u))
    if (data.imageUrl || data.images) {
      await this.prisma.product.update({ where: { id: productId }, data })
    }
  }
}
