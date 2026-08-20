import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { WalletService } from '../wallet/wallet.service'
import { MpOauthService } from '../payments/mp-oauth.service'
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

function computeIsOpen(openingHours: any): boolean | null {
  if (!openingHours || !Array.isArray(openingHours)) return null

  const utcNow = new Date()
  const localMs = utcNow.getTime() - 4 * 60 * 60 * 1000
  const local = new Date(localMs)

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
  ) {}

  // isOpen (mostrado ao cliente) = aberto pelo horário E não pausado manualmente.
  private async syncIsOpen(storeId: string, openingHours: any, currentIsOpen: boolean, isPaused = false): Promise<void> {
    const scheduleOpen = computeIsOpen(openingHours)
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
        .map((s) => this.syncIsOpen(s.id, s.openingHours, s.isOpen, s.isPaused))
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

    await this.syncIsOpen(store.id, store.openingHours, store.isOpen, store.isPaused)

    // isOpen EFETIVO = horário de funcionamento E não pausado manualmente.
    // (computeIsOpen é só o horário; sem isPaused a loja pausada apareceria "Aberta".)
    const scheduleOpen = computeIsOpen(store.openingHours)
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

    await this.syncIsOpen(store.id, store.openingHours, store.isOpen, store.isPaused)

    const scheduleOpen = computeIsOpen(store.openingHours)
    return {
      ...store,
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
    return this.togglePause(userId).then((r) => ({ isPaused: r.isPaused, isOpen: !r.isPaused }))
  }

  async togglePause(userId: string) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')

    const nextPaused = !store.isPaused

    // Trava: a loja só pode ABRIR (nextPaused = false) depois de conectar o
    // Mercado Pago — sem isso ela não recebe pagamento (PIX/cartão) e o pedido
    // seria barrado no checkout de qualquer forma. Só vale quando o marketplace
    // está configurado (feature flag).
    if (!nextPaused && this.mpOauth.isEnabled() && !(store as any).mpConnected) {
      throw new BadRequestException(
        'Conecte sua conta Mercado Pago em Configurações antes de abrir a loja. ' +
        'Lembre de ter uma chave PIX cadastrada na conta MP para receber por PIX.',
      )
    }

    const scheduleOpen = computeIsOpen(store.openingHours)
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
    const wallet = await this.wallet.findByOwner(store.id, 'STORE')
    // Inclui a chave PIX de saque pra o app mostrar/editar na Carteira.
    return { ...wallet, pixKey: store.pixKey ?? null }
  }

  async requestWithdrawal(userId: string, amount: number) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')
    // Precisa da chave PIX cadastrada pra saber PRA ONDE mandar o repasse.
    if (!store.pixKey) throw new BadRequestException('Cadastre sua chave PIX de recebimento antes de solicitar o saque.')
    await this.wallet.debit(store.id, 'STORE', amount, `Saque via PIX (${store.pixKey})`, `saque-${randomUUID()}`)
    return { message: 'Saque solicitado com sucesso. Será processado em até 24h via PIX.' }
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

    const rangeStart =
      period === 'day' ? startOfTodayUtc
      : period === 'month' ? new Date(now.getTime() - 30 * 86_400_000)
      : new Date(now.getTime() - 7 * 86_400_000)

    const [orders, products] = await Promise.all([
      this.prisma.order.findMany({
        where: { storeId: store.id, createdAt: { gte: rangeStart } },
        select: {
          subtotal: true, status: true, createdAt: true,
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

    const delivered = orders.filter(o => o.status === 'DELIVERED')
    const cancelled = orders.filter(o => o.status === 'CANCELLED')
    const totalRevenue = delivered.reduce((s, o) => s + Number(o.subtotal) * STORE_SHARE, 0)
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
        if (idx !== undefined) { buckets[idx].revenue += Number(o.subtotal) * STORE_SHARE; buckets[idx].count++ }
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
        if (idx !== undefined) { buckets[idx].revenue += Number(o.subtotal) * STORE_SHARE; buckets[idx].count++ }
      }
    }

    // Vendas por categoria + top produtos (por unidades) — sobre pedidos entregues.
    const byCategory: Record<string, { name: string; revenue: number; qty: number }> = {}
    const productSales: Record<string, { name: string; qty: number; revenue: number }> = {}
    for (const o of delivered) {
      for (const item of o.items) {
        const itemRevenue = Number(item.unitPrice) * item.quantity * STORE_SHARE
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
