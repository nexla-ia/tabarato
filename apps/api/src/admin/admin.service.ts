import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { UploadsService } from '../uploads/uploads.service'
import { UpdateCourierStatusDto } from './dto/update-courier-status.dto'
import { UpdateCourierDocStatusDto } from './dto/update-courier-doc-status.dto'
import { UpdateStoreStatusDto } from './dto/update-store-status.dto'

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private uploads: UploadsService,
  ) {}

  /**
   * Troca os PATHs privados dos documentos por signed URLs exibíveis (1h). Os
   * documentos ficam num bucket privado — sem isso o admin veria só o path e o
   * <img> quebraria. Valores http legados passam direto.
   */
  private async withSignedDocs<T extends {
    cnhPhotoUrl?: string | null; identityPhotoUrl?: string | null; vehicleDocPhotoUrl?: string | null
  }>(courier: T): Promise<T> {
    const signed = await this.uploads.signDocuments([
      courier.cnhPhotoUrl, courier.identityPhotoUrl, courier.vehicleDocPhotoUrl,
    ])
    return {
      ...courier,
      cnhPhotoUrl: courier.cnhPhotoUrl ? signed[courier.cnhPhotoUrl] ?? null : null,
      identityPhotoUrl: courier.identityPhotoUrl ? signed[courier.identityPhotoUrl] ?? null : null,
      vehicleDocPhotoUrl: courier.vehicleDocPhotoUrl ? signed[courier.vehicleDocPhotoUrl] ?? null : null,
    }
  }

  async getStats() {
    const [totalUsers, pendingCouriers, pendingStores, totalOrders] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.courier.count({ where: { status: 'PENDING' } }),
      this.prisma.store.count({ where: { status: 'PENDING' } }),
      this.prisma.order.count(),
    ])
    return { totalUsers, pendingCouriers, pendingStores, totalOrders }
  }

  async getCouriers(status?: string) {
    const couriers = await this.prisma.courier.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        user: { select: { name: true, email: true, phone: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    // Assina TODOS os documentos numa única chamada (createSignedUrls em lote),
    // em vez de uma por entregador.
    const signed = await this.uploads.signDocuments(
      couriers.flatMap((c) => [c.cnhPhotoUrl, c.identityPhotoUrl, c.vehicleDocPhotoUrl]),
    )
    return couriers.map((c) => ({
      ...c,
      cnhPhotoUrl: c.cnhPhotoUrl ? signed[c.cnhPhotoUrl] ?? null : null,
      identityPhotoUrl: c.identityPhotoUrl ? signed[c.identityPhotoUrl] ?? null : null,
      vehicleDocPhotoUrl: c.vehicleDocPhotoUrl ? signed[c.vehicleDocPhotoUrl] ?? null : null,
    }))
  }

  async updateCourierStatus(id: string, dto: UpdateCourierStatusDto) {
    const courier = await this.prisma.courier.findUnique({ where: { id } })
    if (!courier) throw new NotFoundException('Courier not found')
    const updated = await this.prisma.courier.update({
      where: { id },
      data: { status: dto.status },
      include: { user: { select: { name: true, email: true, phone: true, avatarUrl: true } } },
    })
    return this.withSignedDocs(updated)
  }

  async updateCourierDocStatus(id: string, dto: UpdateCourierDocStatusDto) {
    const courier = await this.prisma.courier.findUnique({ where: { id } })
    if (!courier) throw new NotFoundException('Courier not found')

    const fieldMap = {
      cnh:      'cnhStatus',
      identity: 'identityStatus',
      vehicle:  'vehicleDocStatus',
    } as const

    const updated = await this.prisma.courier.update({
      where: { id },
      data: { [fieldMap[dto.document]]: dto.status },
      include: { user: { select: { name: true, email: true, phone: true, avatarUrl: true } } },
    })

    const allApproved = updated.cnhStatus === 'APPROVED' &&
                        updated.identityStatus === 'APPROVED' &&
                        updated.vehicleDocStatus === 'APPROVED'
    const anyRejected = updated.cnhStatus === 'REJECTED' ||
                        updated.identityStatus === 'REJECTED' ||
                        updated.vehicleDocStatus === 'REJECTED'

    if (allApproved || anyRejected) {
      const finalized = await this.prisma.courier.update({
        where: { id },
        data: { status: allApproved ? 'APPROVED' : 'REJECTED' },
        include: { user: { select: { name: true, email: true, phone: true, avatarUrl: true } } },
      })
      return this.withSignedDocs(finalized)
    }

    return this.withSignedDocs(updated)
  }

  async getStores(status?: string) {
    return this.prisma.store.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        user: { select: { name: true, email: true, phone: true } },
        categories: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
  }

  async updateStoreStatus(id: string, dto: UpdateStoreStatusDto) {
    const store = await this.prisma.store.findUnique({ where: { id } })
    if (!store) throw new NotFoundException('Store not found')
    return this.prisma.store.update({
      where: { id },
      data: { status: dto.status },
    })
  }

  async getUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    })
  }

  async getOrders(status?: string) {
    return this.prisma.order.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        user:    { select: { name: true, email: true, phone: true } },
        store:   { select: { name: true } },
        payment: { select: { method: true, status: true, amount: true } },
        delivery: { select: { status: true, distanceKm: true, courierFee: true, courier: { include: { user: { select: { name: true } } } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
  }
}
