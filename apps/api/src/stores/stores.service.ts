import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
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
function computeIsOpen(openingHours: any): boolean | null {
  if (!openingHours || !Array.isArray(openingHours)) return null

  const utcNow = new Date()
  const localMs = utcNow.getTime() - 4 * 60 * 60 * 1000
  const local = new Date(localMs)

  const dayOfWeek = local.getUTCDay()
  const currentMinutes = local.getUTCHours() * 60 + local.getUTCMinutes()

  const day: DaySchedule = openingHours[dayOfWeek]
  if (!day || !day.open) return false

  const [fh, fm] = day.from.split(':').map(Number)
  const [th, tm] = day.to.split(':').map(Number)

  return currentMinutes >= fh * 60 + fm && currentMinutes <= th * 60 + tm
}

@Injectable()
export class StoresService {
  constructor(private prisma: PrismaService) {}

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

    // Re-fetch with updated isOpen
    const hasHours = stores.some((s) => s.openingHours)
    let result = hasHours
      ? await this.prisma.store.findMany({
          where: {
            status: 'APPROVED',
            ...(categoryId && { categories: { some: { id: categoryId } } }),
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
}
