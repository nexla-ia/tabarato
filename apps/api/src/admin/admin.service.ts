import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { UploadsService } from '../uploads/uploads.service'
import { DeliveryMatchingService } from '../couriers/delivery-matching.service'
import { UpdateCourierStatusDto } from './dto/update-courier-status.dto'
import { UpdateCourierDocStatusDto } from './dto/update-courier-doc-status.dto'
import { UpdateStoreStatusDto } from './dto/update-store-status.dto'

// Status de entrega considerados "ativos" (fora da fila e não finalizados).
const ACTIVE_DELIVERY_STATUS = ['COURIER_ASSIGNED', 'COURIER_HEADING_TO_STORE', 'COURIER_AT_STORE', 'PICKED_UP', 'HEADING_TO_CLIENT'] as const

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private uploads: UploadsService,
    @Optional() private matching: DeliveryMatchingService,
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
    // em vez de uma por entregador. Validade de 12h: o admin costuma deixar a aba
    // aberta durante o expediente; com 1h os docs quebravam (404) ao revisar depois.
    const signed = await this.uploads.signDocuments(
      couriers.flatMap((c) => [c.cnhPhotoUrl, c.identityPhotoUrl, c.vehicleDocPhotoUrl]),
      12 * 60 * 60,
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

  /** Painel de operação ao vivo: pedidos aguardando entregador, entregas em
   *  andamento e entregadores online. */
  async getOperations() {
    const now = Date.now()
    const [waiting, active, online] = await Promise.all([
      this.prisma.delivery.findMany({
        where: { status: 'SEARCHING_COURIER', courierId: null },
        include: {
          order: { select: { store: { select: { name: true, lat: true, lng: true } }, address: { select: { district: true } } } },
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      }),
      this.prisma.delivery.findMany({
        where: { status: { in: ACTIVE_DELIVERY_STATUS as any } },
        include: {
          order: { select: { store: { select: { name: true } }, address: { select: { district: true } } } },
          courier: { select: { id: true, currentLat: true, currentLng: true, user: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
      this.prisma.courier.findMany({
        where: { status: 'APPROVED', isOnline: true },
        select: {
          id: true, currentLat: true, currentLng: true, updatedAt: true,
          user: { select: { name: true } },
          deliveries: { where: { status: { notIn: ['SEARCHING_COURIER', 'DELIVERED', 'FAILED'] } }, select: { id: true }, take: 1 },
        },
      }),
    ])

    return {
      waiting: waiting.map((d) => ({
        deliveryId: d.id, orderId: d.orderId, createdAt: d.createdAt,
        waitingMin: Math.floor((now - new Date(d.createdAt).getTime()) / 60000),
        courierFee: d.courierFee,
        store: (d as any).order?.store ?? null,
        district: (d as any).order?.address?.district ?? null,
      })),
      active: active.map((d) => ({
        deliveryId: d.id, orderId: d.orderId, status: d.status,
        store: (d as any).order?.store ?? null,
        district: (d as any).order?.address?.district ?? null,
        courier: d.courier
          ? { id: d.courier.id, name: d.courier.user?.name ?? null, lat: d.courier.currentLat, lng: d.courier.currentLng }
          : null,
      })),
      onlineCouriers: online.map((c) => ({
        id: c.id, name: c.user?.name ?? null, lat: c.currentLat, lng: c.currentLng,
        updatedAt: c.updatedAt, busy: c.deliveries.length > 0,
      })),
    }
  }

  /** Atribuição manual: liga um entregador a um pedido que está aguardando. */
  async assignDelivery(deliveryId: string, courierId: string) {
    if (!courierId) throw new BadRequestException('Selecione um entregador.')
    const courier = await this.prisma.courier.findUnique({ where: { id: courierId } })
    if (!courier) throw new NotFoundException('Entregador não encontrado.')
    if (courier.status !== 'APPROVED') throw new BadRequestException('Entregador não está aprovado.')

    const active = await this.prisma.delivery.count({
      where: { courierId, status: { notIn: ['SEARCHING_COURIER', 'DELIVERED', 'FAILED'] } },
    })
    if (active > 0) throw new ConflictException('Esse entregador já está em uma entrega.')

    // Claim atômico: só atribui se ainda estiver aguardando (evita corrida com o
    // aceite de um entregador pelo app).
    const claim = await this.prisma.delivery.updateMany({
      where: { id: deliveryId, status: 'SEARCHING_COURIER', courierId: null },
      data: { courierId, status: 'COURIER_HEADING_TO_STORE' },
    })
    if (claim.count === 0) throw new ConflictException('Este pedido não está mais aguardando entregador.')

    this.matching?.cancelMatching(deliveryId)
    return this.prisma.delivery.findUnique({ where: { id: deliveryId } })
  }
}
