import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { WalletService, hideReversedWithdrawals } from '../wallet/wallet.service'
import { MpOauthService } from '../payments/mp-oauth.service'
import { AsaasService } from '../payments/asaas.service'
import { CryptoService } from '../common/crypto.service'
import { AsaasOnboardDto } from './dto/asaas-onboard.dto'
import { CreateStoreDto } from './dto/create-store.dto'
import { UpdateStoreDto } from './dto/update-store.dto'

interface DaySchedule { open: boolean; from: string; to: string }

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// Vilhena-RO is UTC-4 (no DST)
function parseMinutes(time: string): number | null {
  if (!time || typeof time !== 'string') return null
  const [h, m] = time.split(':').map(Number)
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

function computeIsOpen(openingHours: any, scheduleExceptions?: any): boolean | null {
  const utcNow = new Date()
  const localMs = utcNow.getTime() - 4 * 60 * 60 * 1000
  const local = new Date(localMs)

  // Exceção de data (feriado fechado / abertura extraordinária) tem PRIORIDADE
  // sobre o horário semanal — mesma regra do checkout (isStoreOpenNow), pra não
  // ter duas fontes de verdade divergentes.
  if (Array.isArray(scheduleExceptions)) {
    const today = local.toISOString().slice(0, 10) // YYYY-MM-DD no horário local
    const ex = scheduleExceptions.find((e: any) => e && e.date === today)
    if (ex) return !ex.closed
  }

  if (!openingHours || !Array.isArray(openingHours)) return null

  const dayOfWeek = local.getUTCDay()
  const currentMinutes = local.getUTCHours() * 60 + local.getUTCMinutes()

  const day: DaySchedule = openingHours[dayOfWeek]
  if (!day || !day.open) return false

  const fromMin = parseMinutes(day.from)
  const toMin   = parseMinutes(day.to)
  if (fromMin === null || toMin === null) return null // invalid schedule — don't auto-close

  // Horário que cruza a meia-noite (ex.: 18:00 → 02:00): aberto se for depois da
  // abertura OU antes do fechamento.
  if (toMin < fromMin) return currentMinutes >= fromMin || currentMinutes <= toMin
  return currentMinutes >= fromMin && currentMinutes <= toMin
}

// Campos seguros pra expor nos endpoints PÚBLICOS (findAll/findById, sem auth).
// Nunca inclui cnpj/pixKey/userId/documentUrl/mp* (identificadores e tokens do
// Mercado Pago) — isso só a própria loja vê, autenticada, via /stores/my.
const PUBLIC_STORE_SELECT = {
  id: true,
  name: true,
  description: true,
  logoUrl: true,
  phone: true,
  prepTimeMin: true,
  deliveryRadiusKm: true,
  lat: true,
  lng: true,
  address: true,
  photos: true,
  openingHours: true,
  scheduleExceptions: true,
  isOpen: true,
  isPaused: true,
  maxConcurrentOrders: true,
  mpConnected: true,
  createdAt: true,
  updatedAt: true,
  categories: { select: { id: true, name: true, icon: true } },
} as const

@Injectable()
export class StoresService {
  private readonly logger = new Logger(StoresService.name)
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private mpOauth: MpOauthService,
    private asaas: AsaasService,
    private crypto: CryptoService,
  ) {}

  // isOpen (mostrado ao cliente) = aberto pelo horário E não pausado manualmente.
  private async syncIsOpen(storeId: string, openingHours: any, currentIsOpen: boolean, isPaused = false, scheduleExceptions?: any): Promise<void> {
    const scheduleOpen = computeIsOpen(openingHours, scheduleExceptions)
    // Horário inválido → não auto-gerencia por horário, mas respeita o pause.
    const effective = scheduleOpen === null ? !isPaused : scheduleOpen && !isPaused
    if (effective !== currentIsOpen) {
      await this.prisma.store.update({ where: { id: storeId }, data: { isOpen: effective } })
    }
  }

  async create(userId: string, dto: CreateStoreDto) {
    const existing = await this.prisma.store.findUnique({ where: { userId } })
    if (existing) throw new ConflictException('User already has a store')

    const cnpjExists = await this.prisma.store.findUnique({ where: { cnpj: dto.cnpj } })
    if (cnpjExists) throw new ConflictException('CNPJ already registered')

    // Loja nasce PENDENTE e só aparece no marketplace após aprovação do admin
    // (evita loja falsa com CNPJ de terceiros + chave PIX do golpista).
    return this.prisma.store.create({
      data: { ...dto, userId, status: 'PENDING' },
    })
  }

  async findAll(categoryId?: string, search?: string, userLat?: number, userLng?: number) {
    const stores = await this.prisma.store.findMany({
      where: {
        status: 'APPROVED',
        ...(categoryId && { categories: { some: { id: categoryId } } }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { products: { some: { name: { contains: search, mode: 'insensitive' }, isActive: true } } },
          ],
        }),
      },
      select: PUBLIC_STORE_SELECT,
      orderBy: { name: 'asc' },
    })

    // Auto sync isOpen for all stores that have openingHours
    await Promise.allSettled(
      stores
        .filter((s) => s.openingHours)
        .map((s) => this.syncIsOpen(s.id, s.openingHours, s.isOpen, s.isPaused, (s as any).scheduleExceptions))
    )

    // Re-fetch with updated isOpen — preserve ALL original filters (categoryId + search)
    const hasHours = stores.some((s) => s.openingHours)
    let result = hasHours
      ? await this.prisma.store.findMany({
          where: {
            status: 'APPROVED',
            ...(categoryId && { categories: { some: { id: categoryId } } }),
            ...(search && {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { products: { some: { name: { contains: search, mode: 'insensitive' }, isActive: true } } },
              ],
            }),
          },
          select: PUBLIC_STORE_SELECT,
          orderBy: { name: 'asc' },
        })
      : stores

    // Filter by delivery radius if user coordinates are provided
    if (userLat !== undefined && userLng !== undefined && !isNaN(userLat) && !isNaN(userLng)) {
      result = result
        .map((s) => ({ ...s, distanceKm: haversineKm(userLat, userLng, s.lat, s.lng) }))
        .filter((s) => s.distanceKm <= s.deliveryRadiusKm)
        .sort((a, b) => (a as any).distanceKm - (b as any).distanceKm)
    }

    return result
  }

  async findById(id: string) {
    const store = await this.prisma.store.findUnique({
      where: { id },
      select: {
        ...PUBLIC_STORE_SELECT,
        status: true,
        products: {
          where: { isActive: true },
          include: {
            category: true,
            variations: { where: { isActive: true } },
          },
        },
      },
    })
    if (!store) throw new NotFoundException('Store not found')
    // Página pública: loja não-aprovada responde 404 (não enumerar pendentes/suspensas).
    if (store.status !== 'APPROVED') throw new NotFoundException('Store not found')

    await this.syncIsOpen(store.id, store.openingHours, store.isOpen, store.isPaused, (store as any).scheduleExceptions)

    // isOpen EFETIVO = horário de funcionamento E não pausado manualmente.
    // (computeIsOpen é só o horário; sem isPaused a loja pausada apareceria "Aberta".)
    const scheduleOpen = computeIsOpen(store.openingHours, (store as any).scheduleExceptions)
    return {
      ...store,
      isOpen: scheduleOpen === null ? !store.isPaused : scheduleOpen && !store.isPaused,
    }
  }

  async findMyStore(userId: string) {
    const store = await this.prisma.store.findUnique({
      where: { userId },
      include: { categories: { select: { id: true, name: true, icon: true } } },
    })
    if (!store) throw new NotFoundException('Store not found')

    await this.syncIsOpen(store.id, store.openingHours, store.isOpen, store.isPaused, (store as any).scheduleExceptions)

    const scheduleOpen = computeIsOpen(store.openingHours, (store as any).scheduleExceptions)
    // Nunca serializar os tokens do Mercado Pago (mesmo pro dono) — defense-in-depth.
    const { mpAccessToken, mpRefreshToken, mpTokenExpiresAt, ...safe } = store as any
    return {
      ...safe,
      isOpen: scheduleOpen === null ? !store.isPaused : scheduleOpen && !store.isPaused,
    }
  }

  async update(userId: string, dto: UpdateStoreDto) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')

    // categoryIds não é campo escalar — vira relação `set` (substitui o conjunto).
    const { categoryIds, ...rest } = dto
    return this.prisma.store.update({
      where: { id: store.id },
      data: {
        ...rest,
        ...(categoryIds !== undefined && {
          categories: { set: categoryIds.map((id) => ({ id })) },
        }),
      },
      include: { categories: { select: { id: true, name: true, icon: true } } },
    })
  }

  // Abrir/fechar manual = pausar/retomar (o "aberto" real também depende do horário).
  // Persistir em isPaused evita que o auto-schedule reverta na próxima leitura.
  async toggleOpen(userId: string) {
    // Usa o isOpen EFETIVO calculado por togglePause (respeita horário/exceções),
    // não !isPaused — senão "abrir" fora do expediente reportaria Aberta erradamente.
    return this.togglePause(userId).then((r) => ({ isPaused: r.isPaused, isOpen: r.isOpen }))
  }

  async togglePause(userId: string) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')

    const nextPaused = !store.isPaused

    // Trava (LEGADO do marketplace MP): a loja só podia ABRIR depois de conectar o
    // Mercado Pago. Com o Asaas centralizado ligado, a entrada de dinheiro é da
    // plataforma e a loja recebe via carteira + saque PIX — então essa trava é
    // desligada (só vale no modo MP marketplace).
    if (!nextPaused && this.mpOauth.isEnabled() && !this.asaas.moneyInEnabled && !(store as any).mpConnected) {
      throw new BadRequestException(
        'Conecte sua conta Mercado Pago em Configurações antes de abrir a loja. ' +
        'Lembre de ter uma chave PIX cadastrada na conta MP para receber por PIX.',
      )
    }
    // Split Asaas: a loja só ABRE depois de configurar os recebimentos (subconta).
    if (!nextPaused && this.asaas.moneyInEnabled && !(store as any).asaasWalletId) {
      throw new BadRequestException('Configure seus recebimentos (aba "Recebimentos") antes de abrir a loja.')
    }

    const scheduleOpen = computeIsOpen(store.openingHours, (store as any).scheduleExceptions)
    const effectiveOpen = scheduleOpen === null ? !nextPaused : (scheduleOpen && !nextPaused)

    await this.prisma.store.update({
      where: { id: store.id },
      data: { isPaused: nextPaused, isOpen: effectiveOpen },
    })
    return { isPaused: nextPaused, isOpen: effectiveOpen }
  }

  async addCategory(userId: string, categoryId: string) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')

    return this.prisma.store.update({
      where: { id: store.id },
      data: { categories: { connect: { id: categoryId } } },
      include: { categories: true },
    })
  }

  async listCategories() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })
  }

  async findWallet(userId: string) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')

    // Split (subconta): o dinheiro da loja cai DIRETO na subconta Asaas dela — o saldo
    // vem de lá, não da carteira interna da plataforma.
    if (store.asaasWalletId && store.asaasApiKey) {
      let balance = 0
      try { balance = await this.asaas.getBalance(this.crypto.decrypt(store.asaasApiKey)!) } catch { /* mostra 0 se cair */ }
      const withdrawals = await this.prisma.withdrawal.findMany({
        where: { ownerType: 'STORE', ownerId: store.id },
        orderBy: { createdAt: 'desc' }, take: 20,
      })
      return { balance, transactions: [], withdrawals, pixKey: store.pixKey ?? null, source: 'ASAAS' }
    }

    const wallet = await this.wallet.findByOwner(store.id, 'STORE')
    // Inclui a chave PIX de saque pra o app mostrar/editar na Carteira.
    return { ...wallet, transactions: hideReversedWithdrawals((wallet as any).transactions ?? []), pixKey: store.pixKey ?? null }
  }

  /**
   * Saque da loja — repasse automático via PIX-out do Asaas (mesmo fluxo do
   * entregador). Enquanto o Asaas estiver desligado, fica PENDING na fila manual.
   */
  async requestWithdrawal(userId: string, amount: number) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')
    // Precisa da chave PIX cadastrada pra saber PRA ONDE mandar o repasse.
    if (!store.pixKey) throw new BadRequestException('Cadastre sua chave PIX de recebimento antes de solicitar o saque.')

    // Anti duplo-envio: recusa se já houver um saque em andamento recente.
    const inFlight = await this.prisma.withdrawal.findFirst({
      where: { ownerType: 'STORE', ownerId: store.id, status: { in: ['PENDING', 'PROCESSING'] }, createdAt: { gte: new Date(Date.now() - 20_000) } },
    })
    if (inFlight) throw new ConflictException('Você já tem um saque em andamento. Aguarde a confirmação.')

    // Split (subconta): o dinheiro JÁ está na subconta da loja — o saque transfere de
    // LÁ pro banco dela (com a apiKey da subconta). Sem carteira/estorno da plataforma:
    // se falhar, o dinheiro simplesmente continua na subconta.
    if (store.asaasWalletId && store.asaasApiKey) {
      const apiKey = this.crypto.decrypt(store.asaasApiKey)
      if (!apiKey) throw new BadRequestException('Configuração de recebimento inválida. Refaça o cadastro de recebimentos.')
      const w = await this.prisma.withdrawal.create({
        data: { ownerType: 'STORE', ownerId: store.id, amount, pixKey: store.pixKey, status: 'PENDING' },
      })
      try {
        const transfer = await this.asaas.createPixTransfer({
          value: Number(amount), pixAddressKey: store.pixKey, externalReference: w.id,
          description: `Saque Tá Barato — loja ${store.id.slice(0, 8)}`, apiKey,
        })
        await this.prisma.withdrawal.update({ where: { id: w.id }, data: { status: 'PROCESSING', asaasTransferId: transfer.id } })
        return { message: 'Saque solicitado! O PIX está sendo processado e cai em instantes.' }
      } catch (err: any) {
        await this.prisma.withdrawal.update({ where: { id: w.id }, data: { status: 'FAILED', failReason: String(err?.message ?? err).slice(0, 300) } })
        this.logger.error(`Saque loja ${w.id} (subconta) falhou`, err)
        throw new BadRequestException('Não foi possível enviar o PIX agora (confira o saldo disponível). Tente novamente em instantes.')
      }
    }

    // 1) Cria o saque (PENDING) — id determinístico p/ o ref do débito/estorno.
    const withdrawal = await this.prisma.withdrawal.create({
      data: { ownerType: 'STORE', ownerId: store.id, amount, pixKey: store.pixKey, status: 'PENDING' },
    })
    const ref = `saque-${withdrawal.id}`

    // 2) Debita a carteira (atômico). Sem saldo → remove o saque órfão e propaga.
    try {
      await this.wallet.debit(store.id, 'STORE', amount, `Saque via PIX (${store.pixKey})`, ref)
    } catch (err) {
      await this.prisma.withdrawal.delete({ where: { id: withdrawal.id } }).catch(() => {})
      throw err
    }

    // 3) Envia o PIX automático (se o Asaas estiver ligado). Falha → estorna.
    //    O status final (DONE/FAILED) chega pelo mesmo webhook do entregador
    //    (/couriers/asaas/webhook), que já trata saques genéricos por owner.
    if (this.asaas.enabled) {
      try {
        const transfer = await this.asaas.createPixTransfer({
          value: Number(amount),
          pixAddressKey: store.pixKey,
          externalReference: withdrawal.id,
          description: `Repasse Tá Barato — loja ${store.id.slice(0, 8)}`,
        })
        await this.prisma.withdrawal.update({ where: { id: withdrawal.id }, data: { status: 'PROCESSING', asaasTransferId: transfer.id } })
        return { message: 'Saque solicitado! O PIX está sendo processado e cai em instantes.' }
      } catch (err: any) {
        await this.wallet.credit(store.id, 'STORE', amount, 'Estorno de saque não concluído', `estorno-${ref}`)
        await this.prisma.withdrawal.update({ where: { id: withdrawal.id }, data: { status: 'FAILED', failReason: String(err?.message ?? err).slice(0, 300) } })
        this.logger.error(`Saque loja ${withdrawal.id} falhou no Asaas — carteira estornada`, err)
        throw new BadRequestException('Não foi possível enviar o PIX agora. Seu saldo foi mantido. Tente novamente em instantes.')
      }
    }

    return { message: 'Saque solicitado com sucesso. Será processado em até 24h via PIX.' }
  }

  /** Status da subconta Asaas da loja — o app usa pra saber se precisa fazer o onboarding. */
  async asaasStatus(userId: string) {
    const store = await this.prisma.store.findUnique({
      where: { userId },
      select: { asaasOnboarded: true, asaasWalletId: true },
    })
    if (!store) throw new NotFoundException('Store not found')
    return {
      required: this.asaas.moneyInEnabled, // split ligado → a loja precisa de subconta
      onboarded: Boolean(store.asaasOnboarded && store.asaasWalletId),
    }
  }

  /**
   * Onboarding do split: cria a SUBCONTA Asaas da loja. A partir daí, a parte da loja
   * cai DIRETO na subconta (não passa pela conta da plataforma). A apiKey da subconta
   * é guardada CRIPTOGRAFADA (usada pra sacar da subconta). Idempotente.
   */
  async createAsaasAccount(userId: string, dto: AsaasOnboardDto) {
    const store = await this.prisma.store.findUnique({
      where: { userId },
      include: { user: { select: { email: true } } },
    })
    if (!store) throw new NotFoundException('Store not found')
    if (store.asaasWalletId) return { onboarded: true } // já tem subconta

    const email = store.user?.email
    if (!email) throw new BadRequestException('E-mail da loja não encontrado.')
    if (!store.phone) throw new BadRequestException('Cadastre o telefone da loja antes de configurar os recebimentos.')

    try {
      const acc = await this.asaas.createAccount({
        name: store.name,
        email,
        cpfCnpj: store.cnpj,
        mobilePhone: store.phone,
        incomeValue: dto.incomeValue,
        address: dto.address || store.address,
        addressNumber: dto.addressNumber,
        province: dto.province,
        postalCode: dto.postalCode,
        companyType: dto.companyType,
        complement: dto.complement,
      })
      await this.prisma.store.update({
        where: { id: store.id },
        data: {
          asaasAccountId: acc.id,
          asaasWalletId: acc.walletId,
          asaasApiKey: this.crypto.encrypt(acc.apiKey),
          asaasOnboarded: true,
        },
      })
      this.logger.log(`Loja ${store.id.slice(0, 8)} criou subconta Asaas ${acc.id}`)
      return { onboarded: true }
    } catch (err: any) {
      this.logger.error(`Falha ao criar subconta Asaas da loja ${store.id}`, err)
      throw new BadRequestException(`Não foi possível configurar os recebimentos: ${String(err?.message ?? '').slice(0, 160)}`)
    }
  }

  /** Chave PIX da loja — usada só pra RECEBER os saques do repasse (não é pagamento do cliente). */
  async updatePixKey(userId: string, pixKey: string) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')
    const key = (pixKey ?? '').trim()
    if (!key) throw new BadRequestException('Informe uma chave PIX válida.')
    if (key.length > 140) throw new BadRequestException('Chave PIX muito longa.')
    await this.prisma.store.update({ where: { id: store.id }, data: { pixKey: key } })
    return { pixKey: key }
  }

  async findMyReviews(userId: string, page = 1) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')

    const limit = 20
    const safePage = Math.max(1, Math.floor(Number(page)) || 1)
    const skip  = (safePage - 1) * limit
    const [reviews, total, agg] = await Promise.all([
      this.prisma.review.findMany({
        where: { storeId: store.id },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      this.prisma.review.count({ where: { storeId: store.id } }),
      this.prisma.review.aggregate({ where: { storeId: store.id }, _avg: { rating: true } }),
    ])

    return { reviews, total, page, pages: Math.ceil(total / limit), avgRating: agg._avg.rating ?? null }
  }

  // Relatórios do lojista. period: 'day' (hoje, por hora) | 'week' (7 dias) |
  // 'month' (30 dias). O repasse ao lojista é 90% do subtotal (0.9). Bucketing no
  // fuso de Rondônia (UTC-4, sem horário de verão) pra "hoje" bater com o relógio local.
  async getAnalytics(userId: string, period: 'day' | 'week' | 'month' = 'week') {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')

    const STORE_SHARE = 0.9
    const BR_OFFSET_MS = -4 * 3_600_000 // UTC-4 (America/Porto_Velho, sem DST)
    const brParts = (d: Date) => {
      const l = new Date(new Date(d).getTime() + BR_OFFSET_MS)
      return { dateKey: l.toISOString().slice(0, 10), hour: l.getUTCHours() }
    }

    const now = new Date()
    const nowBr = new Date(now.getTime() + BR_OFFSET_MS)
    const todayKey = nowBr.toISOString().slice(0, 10)
    // Meia-noite local de hoje, convertida de volta pra UTC (base das queries).
    const startOfTodayUtc = new Date(Date.parse(todayKey + 'T00:00:00Z') - BR_OFFSET_MS)

    // rangeStart alinhado à meia-noite LOCAL do primeiro bucket (não "now - N dias"
    // rolando), pra soma da série bater com o totalRevenue na borda do período.
    const rangeStart =
      period === 'day' ? startOfTodayUtc
      : period === 'month' ? new Date(startOfTodayUtc.getTime() - 29 * 86_400_000)
      : new Date(startOfTodayUtc.getTime() - 6 * 86_400_000)

    const [orders, products] = await Promise.all([
      this.prisma.order.findMany({
        where: { storeId: store.id, createdAt: { gte: rangeStart } },
        select: {
          subtotal: true, couponDiscount: true, promoDiscount: true, freeShipping: true, deliveryFee: true,
          status: true, createdAt: true,
          payment: { select: { status: true } },
          items: {
            select: {
              productId: true, quantity: true, unitPrice: true,
              product: { select: { name: true, category: { select: { id: true, name: true } } } },
            },
          },
        },
      }),
      this.prisma.product.count({ where: { storeId: store.id, isActive: true } }),
    ])

    // Receita = só pedidos ENTREGUES E PAGOS. Valor líquido da loja (igual ao crédito
    // na carteira): subtotal*0.9 − cupom − promoção − (frete, se frete grátis).
    const orderNet = (o: any) => {
      const gross = Number(o.subtotal) * STORE_SHARE
      const net = gross - Number(o.couponDiscount ?? 0) - Number(o.promoDiscount ?? 0) - (o.freeShipping ? Number(o.deliveryFee ?? 0) : 0)
      return Math.max(0, Math.round(net * 100) / 100)
    }
    // Fator p/ ratear o líquido nos itens (categoria/produto), mantendo a soma = totalRevenue.
    const netFactor = (o: any) => {
      const gross = Number(o.subtotal) * STORE_SHARE
      return gross > 0 ? orderNet(o) / gross : 0
    }

    const delivered = orders.filter(o => o.status === 'DELIVERED' && o.payment?.status === 'PAID')
    const cancelled = orders.filter(o => o.status === 'CANCELLED')
    const totalRevenue = delivered.reduce((s, o) => s + orderNet(o), 0)
    const avgTicket = delivered.length > 0 ? totalRevenue / delivered.length : 0
    const cancellationRate = orders.length > 0 ? (cancelled.length / orders.length) * 100 : 0

    // Série temporal: 'day' → 24 horas de hoje; senão → N dias (7 ou 30).
    type Bucket = { label: string; revenue: number; count: number }
    const buckets: Bucket[] = []
    const bucketIndex = new Map<string, number>()
    if (period === 'day') {
      for (let h = 0; h < 24; h++) {
        bucketIndex.set('h' + h, buckets.length)
        buckets.push({ label: String(h).padStart(2, '0') + 'h', revenue: 0, count: 0 })
      }
      for (const o of delivered) {
        const { hour } = brParts(o.createdAt)
        const idx = bucketIndex.get('h' + hour)
        if (idx !== undefined) { buckets[idx].revenue += orderNet(o); buckets[idx].count++ }
      }
    } else {
      const days = period === 'month' ? 30 : 7
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getTime() + BR_OFFSET_MS - i * 86_400_000)
        const key = d.toISOString().slice(0, 10)
        bucketIndex.set(key, buckets.length)
        buckets.push({ label: key, revenue: 0, count: 0 })
      }
      for (const o of delivered) {
        const { dateKey } = brParts(o.createdAt)
        const idx = bucketIndex.get(dateKey)
        if (idx !== undefined) { buckets[idx].revenue += orderNet(o); buckets[idx].count++ }
      }
    }

    // Vendas por categoria + top produtos (por unidades) — sobre pedidos entregues.
    const byCategory: Record<string, { name: string; revenue: number; qty: number }> = {}
    const productSales: Record<string, { name: string; qty: number; revenue: number }> = {}
    for (const o of delivered) {
      const factor = netFactor(o) // rateia cupom/promoção/frete pelos itens
      for (const item of o.items) {
        const itemRevenue = Number(item.unitPrice) * item.quantity * STORE_SHARE * factor
        const cat = item.product.category
        const catKey = cat?.id ?? 'sem-categoria'
        if (!byCategory[catKey]) byCategory[catKey] = { name: cat?.name ?? 'Sem categoria', revenue: 0, qty: 0 }
        byCategory[catKey].revenue += itemRevenue
        byCategory[catKey].qty += item.quantity

        if (!productSales[item.productId]) productSales[item.productId] = { name: item.product.name, qty: 0, revenue: 0 }
        productSales[item.productId].qty += item.quantity
        productSales[item.productId].revenue += itemRevenue
      }
    }
    const round2 = (n: number) => Math.round(n * 100) / 100
    const salesByCategory = Object.values(byCategory)
      .map(c => ({ ...c, revenue: round2(c.revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
    const topProducts = Object.values(productSales)
      .map(p => ({ ...p, revenue: round2(p.revenue) }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)

    return {
      period,
      totalOrders: orders.length,
      deliveredOrders: delivered.length,
      cancelledOrders: cancelled.length,
      totalRevenue: round2(totalRevenue),
      avgTicket: round2(avgTicket),
      cancellationRate: Math.round(cancellationRate * 10) / 10,
      activeProducts: products,
      // salesByDay mantém compat com o dashboard atual (usa .date/.revenue).
      salesByDay: buckets.map(b => ({ date: b.label, label: b.label, revenue: b.revenue, count: b.count })),
      series: buckets,
      salesByCategory,
      topProducts,
    }
  }

  async getTransactionReceipt(userId: string, transactionId: string): Promise<string> {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')

    const tx = await this.prisma.transaction.findFirst({
      where: { id: transactionId, wallet: { ownerId: store.id, ownerType: 'STORE' } },
      include: { wallet: true },
    })
    if (!tx) throw new NotFoundException('Transação não encontrada')

    const date = new Date(tx.createdAt).toLocaleString('pt-BR')
    const lines = [
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '    COMPROVANTE DE TRANSAÇÃO',
      '    Tá Barato — Plataforma',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `ID:          ${tx.id.slice(-12).toUpperCase()}`,
      `Data:        ${date}`,
      `Tipo:        ${tx.type === 'CREDIT' ? 'Crédito' : 'Débito'}`,
      `Valor:       R$ ${Number(tx.amount).toFixed(2)}`,
      `Descrição:   ${tx.description ?? '—'}`,
      `Referência:  ${tx.referenceId ?? '—'}`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `Loja:        ${store.name}`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ]
    return lines.join('\n')
  }

  async exportOrdersCsv(userId: string): Promise<string> {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')

    const orders = await this.prisma.order.findMany({
      where: { storeId: store.id },
      include: {
        user: { select: { name: true, phone: true } },
        items: { include: { product: { select: { name: true } } } },
        payment: { select: { method: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    })

    const rows = [
      'ID,Data,Cliente,Telefone,Status,Itens,Subtotal,Taxa Entrega,Desconto,Total,Pagamento,Status Pag.',
      ...orders.map(o => {
        const items = o.items.map(i => `${i.product.name}(x${i.quantity})`).join('|')
        const date  = new Date(o.createdAt).toLocaleString('pt-BR')
        return [
          o.id.slice(-8), date, o.user?.name ?? '', o.user?.phone ?? '',
          o.status, items,
          Number(o.subtotal).toFixed(2), Number(o.deliveryFee).toFixed(2),
          Number(o.discount).toFixed(2), Number(o.total).toFixed(2),
          o.payment?.method ?? '', o.payment?.status ?? '',
        ].join(',')
      }),
    ]
    return rows.join('\n')
  }
}
