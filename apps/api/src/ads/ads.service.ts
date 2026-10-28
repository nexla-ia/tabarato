import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { PaymentsService } from '../payments/payments.service'
import { PlatformSettingsService } from '../settings/platform-settings.service'
import { UploadsService } from '../uploads/uploads.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PushService } from '../common/push.service'
import { MailService } from '../common/mail.service'
import { isValidCpf } from '../common/validators/is-cpf.validator'
import { isValidCnpj } from '../common/validators/is-cnpj'
import { ArteInvalida, normalizarArte } from './ads.art'
import { DIA_MS, Janela, proximaJanela } from './ads.schedule'
import { CreateAdDto } from './dto/create-ad.dto'

const MAX_DIAS = 90
const AVISO_RENOVACAO_MS = 2 * DIA_MS
// Trava de agenda no Postgres: dois pagamentos ao mesmo tempo não podem pegar a
// mesma vaga. Número arbitrário, só precisa ser único no sistema.
const LOCK_AGENDA = 717_001

const round2 = (v: number) => Math.round(v * 100) / 100

const dataBr = (d: Date) =>
  d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Porto_Velho' })

/** O que o carrossel precisa — nada de documento, valores ou dono. */
const PUBLICO = {
  id: true, companyName: true, imageUrl: true, linkType: true, linkTarget: true,
} satisfies Prisma.AdSelect

@Injectable()
export class AdsService implements OnModuleInit {
  private readonly logger = new Logger(AdsService.name)

  constructor(
    private prisma: PrismaService,
    private payments: PaymentsService,
    private settings: PlatformSettingsService,
    private uploads: UploadsService,
    private notifications: NotificationsService,
    private push: PushService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    this.payments.onAdPaid((adId, paymentId) => this.ativarPago(adId, paymentId))
  }

  // ── Público ──────────────────────────────────────────────────────────────

  async getConfig() {
    const p = await this.settings.get()
    const ocupadas = await this.janelasOcupadas()
    const agora = new Date()
    return {
      pricePerDay: p.adPricePerDay,
      minDays: p.adMinDays,
      maxDays: MAX_DIAS,
      slots: p.adSlots,
      payDeadlineDays: p.adPayDeadlineDays,
      // Quando entraria um anúncio do tamanho mínimo se fosse pago agora.
      nextStart: proximaJanela(agora, p.adMinDays, p.adSlots, ocupadas).startsAt,
    }
  }

  async live() {
    const agora = new Date()
    const [ads, p] = await Promise.all([
      this.prisma.ad.findMany({
        where: { status: 'PAID', startsAt: { lte: agora }, endsAt: { gt: agora } },
        orderBy: { startsAt: 'asc' },
        select: PUBLICO,
      }),
      this.settings.get(),
    ])
    // Vaga sobrando vira o card "Anuncie aqui" — a vitrine se vende sozinha.
    return { ads, showHouseAd: ads.length < p.adSlots }
  }

  /** Conta exibição/clique só de anúncio no ar (id inventado não grava nada). */
  async track(id: string, kind: 'view' | 'click') {
    const agora = new Date()
    await this.prisma.ad.updateMany({
      where: { id, status: 'PAID', startsAt: { lte: agora }, endsAt: { gt: agora } },
      data: kind === 'view' ? { impressions: { increment: 1 } } : { clicks: { increment: 1 } },
    })
    return { ok: true }
  }

  // ── Anunciante ───────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateAdDto) {
    const p = await this.settings.get()
    if (dto.days < p.adMinDays || dto.days > MAX_DIAS) {
      throw new BadRequestException(`O anúncio precisa ter entre ${p.adMinDays} e ${MAX_DIAS} dias.`)
    }
    const document = dto.document.replace(/\D/g, '')
    if (!(document.length === 11 ? isValidCpf(document) : isValidCnpj(document))) {
      throw new BadRequestException('CPF ou CNPJ inválido. Ele vai na nota fiscal do anúncio.')
    }
    const { linkType, linkTarget } = await this.validarLink(userId, dto.linkType ?? 'NONE', dto.linkTarget)
    const imageUrl = await this.prepararArte(dto.imageUrl)

    const ad = await this.prisma.ad.create({
      data: {
        userId,
        companyName: dto.companyName.trim(),
        document,
        imageUrl,
        linkType,
        linkTarget,
        days: dto.days,
        pricePerDay: p.adPricePerDay,
        totalPrice: round2(p.adPricePerDay * dto.days),
      },
    })
    this.avisarAdmins(ad.companyName, ad.days).catch(() => {})
    return this.paraAnunciante(ad)
  }

  async mine(userId: string) {
    const ads = await this.prisma.ad.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { payment: true },
      take: 50,
    })
    return ads.map((a) => this.paraAnunciante(a))
  }

  async getMine(userId: string, id: string) {
    let ad = await this.doDono(userId, id)
    // Webhook atrasou? Consultar aqui confirma na hora em que a pessoa olha.
    if (ad.status === 'AWAITING_PAYMENT' && ad.payment?.status === 'PENDING') {
      const st = await this.payments.settleAdPayment(ad.payment.id, ad.id)
      if (st !== 'PENDING') ad = await this.doDono(userId, id)
    }
    return this.comPrevisao(ad)
  }

  /** Para quem ainda vai pagar: quando entraria no ar se pagasse agora. */
  private async comPrevisao(ad: Parameters<AdsService['paraAnunciante']>[0]) {
    const view = this.paraAnunciante(ad)
    if (ad.status !== 'AWAITING_PAYMENT') return view
    const p = await this.settings.get()
    const previsao = proximaJanela(new Date(), ad.days, p.adSlots, await this.janelasOcupadas())
    return { ...view, projectedStartsAt: previsao.startsAt, projectedEndsAt: previsao.endsAt }
  }

  /** Gera (ou reaproveita) o PIX de um anúncio aprovado. */
  async pay(userId: string, id: string) {
    const ad = await this.doDono(userId, id)
    // Pago entre abrir a tela e tocar em pagar: devolve o estado, o app mostra "pago".
    if (ad.status === 'PAID') return this.paraAnunciante(ad)
    if (ad.status !== 'AWAITING_PAYMENT') {
      throw new BadRequestException(
        'Este anúncio não está aguardando pagamento.',
      )
    }
    if (ad.payDeadline && ad.payDeadline < new Date()) {
      throw new BadRequestException('O prazo para pagar este anúncio acabou. Faça um pedido novo.')
    }
    const atual = ad.payment
    if (atual?.status === 'PENDING' && atual.pixExpiresAt && atual.pixExpiresAt > new Date()) {
      return this.comPrevisao(ad)
    }
    // O PIX anterior venceu, mas pode ter sido pago no limite: confere antes de
    // gerar outro, para não cobrar duas vezes.
    if (atual && atual.status !== 'PAID') {
      if ((await this.payments.settleAdPayment(atual.id, ad.id)) === 'PAID') return this.getMine(userId, id)
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    const payment = await this.payments.createAdPix({
      adId: ad.id,
      amount: Number(ad.totalPrice),
      userId,
      payerEmail: user?.email ?? '',
      companyName: ad.companyName,
      document: ad.document,
    })
    const atualizado = await this.prisma.ad.update({
      where: { id: ad.id },
      data: { paymentId: payment.id },
      include: { payment: true },
    })
    return this.comPrevisao(atualizado)
  }

  async cancel(userId: string, id: string) {
    const ad = await this.doDono(userId, id)
    const r = await this.prisma.ad.updateMany({
      where: { id: ad.id, status: { in: ['PENDING_REVIEW', 'AWAITING_PAYMENT'] } },
      data: { status: 'CANCELLED' },
    })
    if (!r.count) throw new BadRequestException('Só dá para cancelar antes do pagamento.')
    return { ok: true }
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  async adminList(status?: string) {
    const valido = ['PENDING_REVIEW', 'REJECTED', 'AWAITING_PAYMENT', 'EXPIRED_UNPAID', 'PAID', 'CANCELLED']
    const ads = await this.prisma.ad.findMany({
      where: status && valido.includes(status) ? { status: status as any } : {},
      orderBy: [{ createdAt: 'desc' }],
      include: {
        user: { select: { name: true, email: true, phone: true } },
        payment: { select: { status: true, gateway: true, paidAt: true } },
      },
      take: 200,
    })
    return ads.map((a) => ({
      ...a,
      pricePerDay: Number(a.pricePerDay),
      totalPrice: Number(a.totalPrice),
      payment: a.payment ?? null,
    }))
  }

  async approve(id: string) {
    const p = await this.settings.get()
    const payDeadline = new Date(Date.now() + p.adPayDeadlineDays * DIA_MS)
    const r = await this.prisma.ad.updateMany({
      where: { id, status: 'PENDING_REVIEW' },
      data: { status: 'AWAITING_PAYMENT', reviewedAt: new Date(), payDeadline, rejectReason: null },
    })
    if (!r.count) throw new BadRequestException('Este anúncio não está esperando aprovação.')
    const ad = await this.prisma.ad.findUniqueOrThrow({ where: { id } })
    await this.avisar(ad.userId, ad.id, '✅ Anúncio aprovado',
      `Sua arte foi aprovada. Pague o PIX de ${this.reais(Number(ad.totalPrice))} até ${dataBr(payDeadline)} e o anúncio entra no ar sozinho.`)
    return { ok: true }
  }

  async reject(id: string, reason: string) {
    const r = await this.prisma.ad.updateMany({
      where: { id, status: 'PENDING_REVIEW' },
      data: { status: 'REJECTED', reviewedAt: new Date(), rejectReason: reason.trim() },
    })
    if (!r.count) throw new BadRequestException('Este anúncio não está esperando aprovação.')
    const ad = await this.prisma.ad.findUniqueOrThrow({ where: { id } })
    await this.avisar(ad.userId, ad.id, 'Anúncio não aprovado',
      `Motivo: ${reason.trim()}. Você não foi cobrado — ajuste a arte e envie de novo.`)
    return { ok: true }
  }

  /**
   * Tira do ar / cancela. Anúncio já pago NÃO é estornado automaticamente: o admin
   * decide (estorno no painel do provedor), por isso a resposta avisa.
   */
  async adminCancel(id: string) {
    const ad = await this.prisma.ad.findUnique({ where: { id } })
    if (!ad) throw new NotFoundException('Anúncio não encontrado.')
    if (ad.status === 'CANCELLED' || ad.status === 'REJECTED') return { ok: true, refundNeeded: false }
    await this.prisma.ad.update({ where: { id }, data: { status: 'CANCELLED' } })
    const pago = ad.status === 'PAID'
    await this.avisar(ad.userId, ad.id, 'Anúncio cancelado',
      pago ? 'Seu anúncio foi retirado da vitrine. Nossa equipe vai falar com você sobre o valor pago.'
           : 'Seu pedido de anúncio foi cancelado pela nossa equipe.')
    return { ok: true, refundNeeded: pago }
  }

  // ── Pagamento confirmado ─────────────────────────────────────────────────

  /**
   * Chamado pelo PaymentsService depois de conferir o PIX no provedor. Fixa as
   * datas AQUI (não na aprovação): a agenda de vagas só é certa no pagamento.
   * A trava de agenda serializa pagamentos simultâneos para não estourar as vagas.
   */
  async ativarPago(adId: string, paymentId: string) {
    const p = await this.settings.get()
    const ad = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_AGENDA})`
      const atual = await tx.ad.findUnique({ where: { id: adId } })
      // EXPIRED_UNPAID também vale: o PIX pode ter sido pago no último minuto do prazo.
      if (!atual || !['AWAITING_PAYMENT', 'EXPIRED_UNPAID'].includes(atual.status)) return { atual, ativado: false }
      const agora = new Date()
      const ocupadas = await tx.ad.findMany({
        where: { status: 'PAID', endsAt: { gt: agora } },
        select: { startsAt: true, endsAt: true },
      })
      const janela = proximaJanela(agora, atual.days, p.adSlots, ocupadas as Janela[])
      const salvo = await tx.ad.update({
        where: { id: adId },
        data: {
          status: 'PAID', paymentId, paidAt: agora,
          startsAt: janela.startsAt, endsAt: janela.endsAt,
          liveNotified: janela.startsAt <= agora,
        },
      })
      return { atual: salvo, ativado: true }
    })

    if (!ad.ativado) {
      // Pagou um anúncio cancelado/recusado/já pago: o dinheiro entrou e alguém
      // precisa devolver. Fica no log de erro para o admin achar.
      this.logger.error(`PIX ${paymentId} pago para o anúncio ${adId} em estado ${ad.atual?.status ?? 'inexistente'} — ESTORNAR manualmente`)
      return
    }
    const a = ad.atual!
    const noAr = a.startsAt! <= new Date()
    await this.avisar(a.userId, a.id,
      noAr ? '🎉 Seu anúncio está no ar!' : '✅ Pagamento confirmado',
      noAr ? `Ele aparece na tela inicial até ${dataBr(a.endsAt!)}.`
           : `Seu anúncio entra no ar em ${dataBr(a.startsAt!)} e fica até ${dataBr(a.endsAt!)}.`)
  }

  // ── Rotinas ──────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_10_MINUTES)
  async rotinas() {
    await this.expirarNaoPagos().catch((e) => this.logger.error('expirarNaoPagos', e))
    await this.avisarEntradaNoAr().catch((e) => this.logger.error('avisarEntradaNoAr', e))
    await this.avisarRenovacao().catch((e) => this.logger.error('avisarRenovacao', e))
  }

  async expirarNaoPagos() {
    const vencidos = await this.prisma.ad.findMany({
      where: { status: 'AWAITING_PAYMENT', payDeadline: { lt: new Date() } },
      include: { payment: { select: { id: true, status: true } } },
      take: 100,
    })
    for (const ad of vencidos) {
      // Última conferida: pode ter pago e o webhook se perdido.
      if (ad.payment && ad.payment.status !== 'PAID') {
        if ((await this.payments.settleAdPayment(ad.payment.id, ad.id)) === 'PAID') continue
      }
      const r = await this.prisma.ad.updateMany({
        where: { id: ad.id, status: 'AWAITING_PAYMENT' },
        data: { status: 'EXPIRED_UNPAID' },
      })
      if (r.count) {
        await this.avisar(ad.userId, ad.id, 'Prazo do anúncio acabou',
          'O PIX não foi pago dentro do prazo e o pedido foi encerrado. Se ainda quiser anunciar, é só pedir de novo.')
      }
    }
  }

  async avisarEntradaNoAr() {
    const agora = new Date()
    const ads = await this.prisma.ad.findMany({
      where: { status: 'PAID', liveNotified: false, startsAt: { lte: agora }, endsAt: { gt: agora } },
      take: 100,
    })
    for (const ad of ads) {
      const r = await this.prisma.ad.updateMany({ where: { id: ad.id, liveNotified: false }, data: { liveNotified: true } })
      if (r.count) {
        await this.avisar(ad.userId, ad.id, '🎉 Seu anúncio está no ar!', `Ele aparece na tela inicial até ${dataBr(ad.endsAt!)}.`)
      }
    }
  }

  async avisarRenovacao() {
    const agora = new Date()
    const ads = await this.prisma.ad.findMany({
      where: {
        status: 'PAID', renewalNotified: false,
        startsAt: { lte: agora },
        endsAt: { gt: agora, lte: new Date(agora.getTime() + AVISO_RENOVACAO_MS) },
      },
      take: 100,
    })
    for (const ad of ads) {
      const r = await this.prisma.ad.updateMany({ where: { id: ad.id, renewalNotified: false }, data: { renewalNotified: true } })
      if (r.count) {
        await this.avisar(ad.userId, ad.id, 'Seu anúncio termina em breve',
          `Ele sai do ar em ${dataBr(ad.endsAt!)}. Já teve ${ad.impressions} exibições e ${ad.clicks} cliques — dá para renovar pelo app.`)
      }
    }
  }

  // ── Internos ─────────────────────────────────────────────────────────────

  private async janelasOcupadas(): Promise<Janela[]> {
    const rows = await this.prisma.ad.findMany({
      where: { status: 'PAID', endsAt: { gt: new Date() } },
      select: { startsAt: true, endsAt: true },
    })
    return rows as Janela[]
  }

  private async doDono(userId: string, id: string) {
    const ad = await this.prisma.ad.findUnique({ where: { id }, include: { payment: true } })
    if (!ad) throw new NotFoundException('Anúncio não encontrado.')
    if (ad.userId !== userId) throw new ForbiddenException('Acesso negado.')
    return ad
  }

  private paraAnunciante(ad: any) {
    const pay = ad.payment
    const pixAtivo = ad.status === 'AWAITING_PAYMENT' && pay?.status === 'PENDING'
      && pay.pixExpiresAt && new Date(pay.pixExpiresAt) > new Date()
    const agora = Date.now()
    return {
      id: ad.id,
      companyName: ad.companyName,
      document: ad.document,
      imageUrl: ad.imageUrl,
      linkType: ad.linkType,
      linkTarget: ad.linkTarget,
      days: ad.days,
      pricePerDay: Number(ad.pricePerDay),
      totalPrice: Number(ad.totalPrice),
      status: ad.status,
      // "No ar" é derivado: pago e dentro da janela.
      live: ad.status === 'PAID' && ad.startsAt && new Date(ad.startsAt).getTime() <= agora && new Date(ad.endsAt).getTime() > agora,
      rejectReason: ad.rejectReason,
      payDeadline: ad.payDeadline,
      paidAt: ad.paidAt,
      startsAt: ad.startsAt,
      endsAt: ad.endsAt,
      impressions: ad.impressions,
      clicks: ad.clicks,
      createdAt: ad.createdAt,
      pix: pixAtivo ? { code: pay.pixCode, qrBase64: pay.pixQrBase64, expiresAt: pay.pixExpiresAt } : null,
    }
  }

  private async validarLink(userId: string, linkType: CreateAdDto['linkType'] & string, alvo?: string) {
    const t = (alvo ?? '').trim()
    switch (linkType) {
      case 'NONE':
        return { linkType, linkTarget: null }
      case 'STORE': {
        // Só a própria loja: ninguém compra anúncio apontando para o concorrente.
        const store = await this.prisma.store.findFirst({ where: { userId }, select: { id: true } })
        if (!store) throw new BadRequestException('Você não tem loja no Tá Barato. Escolha outro destino para o anúncio.')
        return { linkType, linkTarget: store.id }
      }
      case 'WHATSAPP': {
        let d = t.replace(/\D/g, '')
        if (d.length === 10 || d.length === 11) d = `55${d}`
        if (!/^55\d{10,11}$/.test(d)) throw new BadRequestException('WhatsApp inválido. Use DDD + número.')
        return { linkType, linkTarget: d }
      }
      case 'URL': {
        let url: URL
        try { url = new URL(t) } catch { throw new BadRequestException('Link inválido. Comece com https://') }
        if (url.protocol !== 'https:') throw new BadRequestException('O link precisa começar com https://')
        return { linkType, linkTarget: url.toString() }
      }
      default:
        throw new BadRequestException('Destino do anúncio inválido.')
    }
  }

  /** Baixa a arte do NOSSO bucket, confere o formato e grava a versão 1200 × 400. */
  private async prepararArte(url: string): Promise<string> {
    const base = (this.config.get<string>('SUPABASE_URL') ?? '').replace(/\/$/, '')
    const prefixo = `${base}/storage/v1/object/public/product-images/`
    if (!base || !url.startsWith(prefixo) || url.includes('..')) {
      throw new BadRequestException('Envie a arte pelo app antes de continuar.')
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20_000)
    let entrada: Buffer
    try {
      const res = await fetch(url, { signal: ctrl.signal })
      if (!res.ok) throw new Error(String(res.status))
      entrada = Buffer.from(await res.arrayBuffer())
    } catch {
      throw new BadRequestException('Não conseguimos abrir a arte enviada. Envie de novo.')
    } finally {
      clearTimeout(timer)
    }
    try {
      return await this.uploads.uploadImageBuffer(await normalizarArte(entrada), 'image/jpeg')
    } catch (e) {
      if (e instanceof ArteInvalida) throw new BadRequestException(e.message)
      throw e
    }
  }

  private reais(v: number) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  /** Aviso ao anunciante pelos três canais. Nenhum deles pode derrubar o fluxo. */
  private async avisar(userId: string, adId: string, titulo: string, texto: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId }, select: { name: true, email: true, pushToken: true },
    })
    if (!user) return
    const data = { adId, screen: 'meus-anuncios' }
    this.notifications.create(userId, 'PROMOTION', titulo, texto, data).catch(() => {})
    if (user.pushToken) this.push.send(user.pushToken, titulo, texto, data).catch(() => {})
    if (user.email) {
      const web = (this.config.get<string>('WEB_URL') || 'https://tabaratoapp.com.br').replace(/\/$/, '')
      const html = `
        <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1A0A00">
          <h1 style="font-size:20px;margin:0 0 8px">${titulo}</h1>
          <p style="font-size:14px;color:#7A5C4A;margin:0 0 20px;line-height:1.5">${texto}</p>
          <a href="${web}/meus-anuncios" style="display:inline-block;background:#FF6600;color:#fff;text-decoration:none;
             font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px">Ver meus anúncios</a>
        </div>`
      this.mail.send(user.email, `${titulo} — Tá Barato`, html, `${titulo}. ${texto} ${web}/meus-anuncios`).catch(() => {})
    }
  }

  private async avisarAdmins(empresa: string, dias: number) {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true }, select: { id: true, pushToken: true },
    })
    const titulo = '📣 Anúncio para aprovar'
    const texto = `${empresa} quer anunciar por ${dias} dias. Confira a arte no painel.`
    for (const a of admins) {
      this.notifications.create(a.id, 'SYSTEM', titulo, texto, { screen: 'admin-ads' }).catch(() => {})
      if (a.pushToken) this.push.send(a.pushToken, titulo, texto, { screen: 'admin-ads' }).catch(() => {})
    }
  }
}
