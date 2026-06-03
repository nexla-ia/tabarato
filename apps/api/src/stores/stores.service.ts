import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { WalletService } from '../wallet/wallet.service'
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

  return currentMinutes >= fromMin && currentMinutes <= toMin
}

@Injectable()
export class StoresService {
  private readonly logger = new Logger(StoresService.name)
  constructor(private prisma: PrismaService, private wallet: WalletService) {}

  private async syncIsOpen(storeId: string, openingHours: any, currentIsOpen: boolean): Promise<void> {
    const shouldBeOpen = computeIsOpen(openingHours)
    if (shouldBeOpen !== null && shouldBeOpen !== currentIsOpen) {
      await this.prisma.store.update({
        where: { id: storeId },
        data: { isOpen: shouldBeOpen },
      })
    }
  }

  async create(userId: string, dto: CreateStoreDto) {
    const existing = await this.prisma.store.findUnique({ where: { userId } })
    if (existing) throw new ConflictException('User already has a store')

    const cnpjExists = await this.prisma.store.findUnique({ where: { cnpj: dto.cnpj } })
    if (cnpjExists) throw new ConflictException('CNPJ already registered')

    return this.prisma.store.create({
      data: { ...dto, userId, status: 'APPROVED' },
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
      include: { categories: { select: { id: true, name: true, icon: true } } },
      orderBy: { name: 'asc' },
    })

    // Auto sync isOpen for all stores that have openingHours
    await Promise.allSettled(
      stores
        .filter((s) => s.openingHours)
        .map((s) => this.syncIsOpen(s.id, s.openingHours, s.isOpen))
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
          include: { categories: { select: { id: true, name: true, icon: true } } },
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
      include: {
        categories: true,
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

    await this.syncIsOpen(store.id, store.openingHours, store.isOpen)

    // Return with updated isOpen if changed
    const shouldBeOpen = computeIsOpen(store.openingHours)
    return {
      ...store,
      isOpen: shouldBeOpen !== null ? shouldBeOpen : store.isOpen,
    }
  }

  async findMyStore(userId: string) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')

    await this.syncIsOpen(store.id, store.openingHours, store.isOpen)

    const shouldBeOpen = computeIsOpen(store.openingHours)
    return {
      ...store,
      isOpen: shouldBeOpen !== null ? shouldBeOpen : store.isOpen,
    }
  }

  async update(userId: string, dto: UpdateStoreDto) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')

    return this.prisma.store.update({
      where: { id: store.id },
      data: dto,
    })
  }

  async toggleOpen(userId: string) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')

    // Manual toggle overrides auto-schedule until next sync
    return this.prisma.store.update({
      where: { id: store.id },
      data: { isOpen: !store.isOpen },
      select: { id: true, isOpen: true },
    })
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
    return this.wallet.findByOwner(store.id, 'STORE')
  }

  async requestWithdrawal(userId: string, amount: number) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')
    await this.wallet.debit(store.id, 'STORE', amount, 'Saque solicitado', `saque-${crypto.randomUUID()}`)
    return { message: 'Saque solicitado com sucesso. Será processado em até 24h via PIX.' }
  }

  async togglePause(userId: string) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')
    // isPaused stored in openingHours json as a meta flag to avoid schema change
    const meta = (store as any).pausedUntil
    if (meta) {
      // Unpause: clear flag, restore isOpen based on schedule
      await this.prisma.store.update({ where: { id: store.id }, data: { isOpen: computeIsOpen(store.openingHours) ?? store.isOpen } })
      return { isPaused: false }
    }
    // Pause: close the store temporarily
    await this.prisma.store.update({ where: { id: store.id }, data: { isOpen: false } })
    return { isPaused: true }
  }

  async findMyReviews(userId: string, page = 1) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Store not found')

    const limit = 20
    const skip  = (page - 1) * limit
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
