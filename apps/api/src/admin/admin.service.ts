import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { UploadsService } from '../uploads/uploads.service'
import { DeliveryMatchingService } from '../couriers/delivery-matching.service'
import { PlatformSettingsService, Pricing } from '../settings/platform-settings.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PushService } from '../common/push.service'
import { UpdateCourierStatusDto } from './dto/update-courier-status.dto'
import { UpdateCourierDocStatusDto } from './dto/update-courier-doc-status.dto'
import { UpdateStoreStatusDto } from './dto/update-store-status.dto'

// Status de entrega considerados "ativos" (fora da fila e não finalizados).
const ACTIVE_DELIVERY_STATUS = ['COURIER_ASSIGNED', 'COURIER_HEADING_TO_STORE', 'COURIER_AT_STORE', 'PICKED_UP', 'HEADING_TO_CLIENT'] as const

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name)
  constructor(
    private prisma: PrismaService,
    private uploads: UploadsService,
    private settings: PlatformSettingsService,
    private notifications: NotificationsService,
    private push: PushService,
    @Optional() private matching: DeliveryMatchingService,
  ) {}

  /** Avisa o entregador quando o cadastro é aprovado/reprovado/suspenso (push + notificação). */
  private async notifyCourierDecision(
    user: { id?: string; pushToken?: string | null } | undefined | null,
    status: string,
  ) {
    if (!user?.id) return
    const map: Record<string, { title: string; body: string }> = {
      APPROVED:  { title: '✅ Cadastro aprovado!', body: 'Tudo certo! Fique online e comece a receber corridas.' },
      REJECTED:  { title: 'Cadastro não aprovado', body: 'Revise seus documentos no app e reenvie para nova análise.' },
      SUSPENDED: { title: 'Conta suspensa', body: 'Sua conta de entregador foi suspensa. Fale com o suporte.' },
    }
    const msg = map[status]
    if (!msg) return
    if (user.pushToken) this.push.send(user.pushToken, msg.title, msg.body, { screen: 'courier' }).catch(() => {})
    this.notifications.create(user.id, 'SYSTEM', msg.title, msg.body, { kind: 'courier_status', status }).catch((e) => {
      this.logger.warn('Falha ao notificar decisão de cadastro do entregador', e)
    })
  }

  /** Configuração de preços (taxa de entrega, repasse do motoboy, comissão). */
  getSettings() {
    return this.settings.get()
  }

  updateSettings(patch: Partial<Pricing>) {
    return this.settings.update(patch)
  }

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
      include: { user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true, pushToken: true } } },
    })
    if (courier.status !== dto.status) this.notifyCourierDecision(updated.user, dto.status)
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
      include: { user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true, pushToken: true } } },
    })

    const allApproved = updated.cnhStatus === 'APPROVED' &&
                        updated.identityStatus === 'APPROVED' &&
                        updated.vehicleDocStatus === 'APPROVED'
    const anyRejected = updated.cnhStatus === 'REJECTED' ||
                        updated.identityStatus === 'REJECTED' ||
                        updated.vehicleDocStatus === 'REJECTED'

    if (allApproved || anyRejected) {
      const nextStatus = allApproved ? 'APPROVED' : 'REJECTED'
      const finalized = await this.prisma.courier.update({
        where: { id },
        data: { status: nextStatus },
        include: { user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true, pushToken: true } } },
      })
      if (courier.status !== nextStatus) this.notifyCourierDecision(finalized.user, nextStatus)
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

  /** Moderação: lista produtos de todas as lojas (busca por nome, filtro bloqueados). */
  async getProducts(search?: string, blocked?: string) {
    const where: any = {}
    if (search?.trim()) where.name = { contains: search.trim(), mode: 'insensitive' }
    if (blocked === 'true') where.blockedByAdmin = true
    else if (blocked === 'false') where.blockedByAdmin = false
    return this.prisma.product.findMany({
      where,
      select: {
        id: true, name: true, imageUrl: true, basePrice: true, isActive: true,
        blockedByAdmin: true, blockReason: true, createdAt: true,
        store: { select: { id: true, name: true } },
        category: { select: { name: true } },
      },
      orderBy: [{ blockedByAdmin: 'desc' }, { createdAt: 'desc' }],
      take: 300,
    })
  }

  /** Bloqueia/desbloqueia um produto (some pro cliente e não pode ser pedido). */
  async setProductBlock(id: string, blocked: boolean, reason?: string) {
    const product = await this.prisma.product.findUnique({ where: { id } })
    if (!product) throw new NotFoundException('Produto não encontrado')
    return this.prisma.product.update({
      where: { id },
      data: { blockedByAdmin: blocked, blockReason: blocked ? (reason?.trim() || null) : null },
      select: { id: true, blockedByAdmin: true, blockReason: true },
    })
  }

  /**
   * Saques de lojas e entregadores. Existe para dar VISIBILIDADE: o desfecho é
   * automático (PIX-out + webhook + cron de reconciliação), mas sem uma tela
   * ninguém percebe um saque preso em PROCESSING ou um PENDING nunca enviado.
   */
  async getWithdrawals(status?: string) {
    const rows = await this.prisma.withdrawal.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    // Não há relação direta com Store (só com Courier, legado) — resolve o nome
    // do dono em duas consultas em lote em vez de uma por linha.
    const storeIds = rows.filter(r => r.ownerType === 'STORE' && r.ownerId).map(r => r.ownerId!)
    const courierIds = rows
      .filter(r => r.ownerType !== 'STORE')
      .map(r => r.ownerId ?? r.courierId)
      .filter((v): v is string => Boolean(v))

    const [stores, couriers] = await Promise.all([
      storeIds.length
        ? this.prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      courierIds.length
        ? this.prisma.courier.findMany({
            where: { id: { in: courierIds } },
            select: { id: true, user: { select: { name: true } } },
          })
        : Promise.resolve([]),
    ])
    const storeName = new Map<string, string>(stores.map(s => [s.id, s.name] as [string, string]))
    const courierName = new Map<string, string | null>(couriers.map(c => [c.id, c.user?.name ?? null] as [string, string | null]))

    return rows.map(r => ({
      id: r.id,
      ownerType: r.ownerType,
      ownerName: r.ownerType === 'STORE'
        ? storeName.get(r.ownerId ?? '') ?? null
        : courierName.get(r.ownerId ?? r.courierId ?? '') ?? null,
      amount: r.amount,
      pixKey: r.pixKey,
      pixKeyType: r.pixKeyType,
      status: r.status,
      failReason: r.failReason,
      asaasTransferId: r.asaasTransferId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))
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
    const delivery = await this.prisma.delivery.findUnique({ where: { id: deliveryId } })

    // Avisa o entregador da corrida atribuída (push + notificação) — antes só via poll.
    const cu = await this.prisma.courier.findUnique({
      where: { id: courierId },
      select: { userId: true, user: { select: { pushToken: true } } },
    })
    const title = '🛵 Corrida atribuída a você'
    const body = 'Você recebeu uma entrega. Abra o app para começar.'
    if (cu?.user?.pushToken) {
      this.push.send(cu.user.pushToken, title, body, { orderId: delivery?.orderId, type: 'NEW_DELIVERY' }).catch(() => {})
    }
    if (cu?.userId) {
      this.notifications.create(cu.userId, 'DELIVERY_UPDATE', title, body, { orderId: delivery?.orderId }).catch(() => {})
    }
    return delivery
  }
}
