import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateProductDto } from './dto/create-product.dto'
import { CreateVariationDto } from './dto/create-variation.dto'

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, storeId: string, dto: CreateProductDto) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } })
    if (!store) throw new NotFoundException('Store not found')
    if (store.userId !== userId) throw new ForbiddenException('Not your store')

    return this.prisma.product.create({
      data: { ...dto, storeId, hasVariations: false },
      include: { category: true },
    })
  }

  async findPopular(limit = 12) {
    // Aggregate order items to find most-ordered products
    const topItems = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit * 2, // fetch extra to account for inactive/unavailable
    })

    const productIds = topItems.map(t => t.productId)
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true,
        store: { status: 'APPROVED' },
      },
      include: {
        category: { select: { id: true, name: true } },
        store: { select: { id: true, name: true, logoUrl: true, isOpen: true, prepTimeMin: true } },
        variations: { where: { isActive: true }, select: { price: true }, take: 1, orderBy: { price: 'asc' } },
      },
      take: limit,
    })

    // Re-sort by original ranking from orderItem aggregation
    const rankMap = new Map(topItems.map((t, i) => [t.productId, i]))
    return products
      .sort((a, b) => (rankMap.get(a.id) ?? 999) - (rankMap.get(b.id) ?? 999))
      .map(p => ({
        ...p,
        totalOrdered: topItems.find(t => t.productId === p.id)?._sum.quantity ?? 0,
        displayPrice: p.basePrice ?? p.variations[0]?.price ?? null,
      }))
  }

  /**
   * Lista produtos de TODAS as lojas aprovadas — alimenta a home focada em itens.
   * Filtra por categoria (categoria da LOJA, many-to-many) e/ou busca no nome.
   * Ordena lojas abertas primeiro. Retorna preço de exibição (base ou menor variação).
   */
  async findAll(opts: {
    categoryId?: string; productCategoryId?: string; excludeId?: string; search?: string; limit?: number
    minPrice?: number; maxPrice?: number; minRating?: number; sort?: 'rating' | 'price_asc' | 'price_desc'
  }) {
    const { categoryId, productCategoryId, excludeId, search, minPrice, maxPrice, minRating, sort } = opts
    const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100)

    // Preço: casa se o preço-base OU alguma variação ativa estiver na faixa.
    const priceFilter = (minPrice != null || maxPrice != null)
      ? {
          OR: [
            { basePrice: { gte: minPrice, lte: maxPrice } },
            { variations: { some: { isActive: true, price: { gte: minPrice, lte: maxPrice } } } },
          ],
        }
      : {}

    const orderBy =
      sort === 'rating'     ? [{ store: { rating: { sort: 'desc', nulls: 'last' } } }, { name: 'asc' }]
      : sort === 'price_asc'  ? [{ basePrice: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }]
      : sort === 'price_desc' ? [{ basePrice: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }]
      : [{ store: { isOpen: 'desc' } }, { name: 'asc' }]

    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        ...(productCategoryId ? { categoryId: productCategoryId } : {}),
        store: {
          status: 'APPROVED',
          ...(categoryId ? { categories: { some: { id: categoryId } } } : {}),
          ...(minRating != null ? { rating: { gte: minRating } } : {}),
        },
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
        ...priceFilter,
      },
      include: {
        store: { select: { id: true, name: true, logoUrl: true, isOpen: true, prepTimeMin: true, rating: true, reviewCount: true } },
        variations: { where: { isActive: true }, select: { price: true }, take: 1, orderBy: { price: 'asc' } },
      },
      orderBy: orderBy as any,
      take: limit,
    })

    return products.map((p) => ({
      ...p,
      displayPrice: p.basePrice ?? p.variations[0]?.price ?? null,
    }))
  }

  async findByStore(storeId: string) {
    // Só expõe catálogo de loja APROVADA (evita enumeração de lojas pendentes/suspensas).
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { status: true } })
    if (!store || store.status !== 'APPROVED') return []

    return this.prisma.product.findMany({
      where: { storeId, isActive: true },
      include: {
        category: true,
        variations: { where: { isActive: true } },
      },
      orderBy: { name: 'asc' },
    })
  }

  async findMy(userId: string) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) return []

    return this.prisma.product.findMany({
      where: { storeId: store.id },
      include: {
        category: true,
        variations: { where: { isActive: true } },
      },
      orderBy: { name: 'asc' },
    })
  }

  async findById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        variations: { where: { isActive: true } },
      },
    })
    if (!product) throw new NotFoundException('Product not found')

    // Não existe avaliação por item — a "nota do produto" é a média das
    // avaliações da loja nos pedidos que continham este produto.
    const orders = await this.prisma.orderItem.findMany({
      where: { productId: id },
      select: { orderId: true },
      distinct: ['orderId'],
    })
    const orderIds = orders.map((o) => o.orderId)
    const agg = orderIds.length
      ? await this.prisma.review.aggregate({
          where: { orderId: { in: orderIds } },
          _avg: { rating: true },
          _count: { rating: true },
        })
      : null

    // "X pessoas compraram" — clientes distintos com pedido ENTREGUE contendo
    // este produto (não é soma de unidades, é gente diferente que já recebeu).
    const buyers = await this.prisma.order.findMany({
      where: { status: 'DELIVERED', items: { some: { productId: id } } },
      select: { userId: true },
      distinct: ['userId'],
    })

    return {
      ...product,
      avgRating: agg?._avg.rating ?? null,
      reviewCount: agg?._count.rating ?? 0,
      soldCount: buyers.length,
    }
  }

  async update(userId: string, productId: string, dto: Partial<CreateProductDto>) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { store: true },
    })
    if (!product) throw new NotFoundException('Product not found')
    if (product.store.userId !== userId) throw new ForbiddenException('Not your product')

    return this.prisma.product.update({
      where: { id: productId },
      data: dto,
      include: { category: true },
    })
  }

  async toggleActive(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { store: true },
    })
    if (!product) throw new NotFoundException('Product not found')
    if (product.store.userId !== userId) throw new ForbiddenException('Not your product')

    return this.prisma.product.update({
      where: { id: productId },
      data: { isActive: !product.isActive },
      select: { id: true, isActive: true },
    })
  }

  async remove(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { store: true },
    })
    if (!product) throw new NotFoundException('Product not found')
    if (product.store.userId !== userId) throw new ForbiddenException('Not your product')

    return this.prisma.product.update({
      where: { id: productId },
      data: { isActive: false },
    })
  }

  async addVariation(userId: string, productId: string, dto: CreateVariationDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { store: true },
    })
    if (!product) throw new NotFoundException('Product not found')
    if (product.store.userId !== userId) throw new ForbiddenException('Not your product')

    const [variation] = await this.prisma.$transaction([
      this.prisma.productVariation.create({ data: { ...dto, productId } }),
      ...(product.hasVariations
        ? []
        : [this.prisma.product.update({ where: { id: productId }, data: { hasVariations: true } })]),
    ])

    return variation
  }

  async getVariations(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { store: true },
    })
    if (!product) throw new NotFoundException('Product not found')
    if (product.store.userId !== userId) throw new ForbiddenException('Not your product')

    return this.prisma.productVariation.findMany({
      where: { productId },
      orderBy: { createdAt: 'asc' },
    })
  }

  async updateVariation(userId: string, variationId: string, dto: CreateVariationDto) {
    const variation = await this.prisma.productVariation.findUnique({
      where: { id: variationId },
      include: { product: { include: { store: true } } },
    })
    if (!variation) throw new NotFoundException('Variation not found')
    if (variation.product.store.userId !== userId) throw new ForbiddenException('Not your product')

    return this.prisma.productVariation.update({
      where: { id: variationId },
      data: dto,
    })
  }

  async toggleVariation(userId: string, variationId: string) {
    const variation = await this.prisma.productVariation.findUnique({
      where: { id: variationId },
      include: { product: { include: { store: true } } },
    })
    if (!variation) throw new NotFoundException('Variation not found')
    if (variation.product.store.userId !== userId) throw new ForbiddenException('Not your product')

    return this.prisma.productVariation.update({
      where: { id: variationId },
      data: { isActive: !variation.isActive },
      select: { id: true, isActive: true },
    })
  }

  async removeVariation(userId: string, variationId: string) {
    const variation = await this.prisma.productVariation.findUnique({
      where: { id: variationId },
      include: { product: { include: { store: true } } },
    })
    if (!variation) throw new NotFoundException('Variation not found')
    if (variation.product.store.userId !== userId) throw new ForbiddenException('Not your product')

    const productId = variation.productId
    await this.prisma.productVariation.delete({ where: { id: variationId } })

    const remaining = await this.prisma.productVariation.count({ where: { productId } })
    if (remaining === 0) {
      await this.prisma.product.update({ where: { id: productId }, data: { hasVariations: false } })
    }

    return { deleted: true }
  }

  async duplicate(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { store: true, variations: true },
    })
    if (!product) throw new NotFoundException('Product not found')
    if (product.store.userId !== userId) throw new ForbiddenException('Not your product')

    const { id: _id, createdAt: _c, updatedAt: _u, store: _s, variations, ...data } = product as any
    const newProduct = await this.prisma.product.create({
      data: { ...data, name: `${product.name} (cópia)`, isActive: false },
      include: { category: true },
    })

    if (variations.length > 0) {
      await this.prisma.productVariation.createMany({
        data: variations.map(({ id: _vid, createdAt: _vc, productId: _pid, ...v }: any) => ({
          ...v, productId: newProduct.id,
        })),
      })
      await this.prisma.product.update({ where: { id: newProduct.id }, data: { hasVariations: true } })
    }

    return { ...newProduct, hasVariations: variations.length > 0 }
  }

  async bulkToggle(userId: string, productIds: string[], active: boolean) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new ForbiddenException()

    await this.prisma.product.updateMany({
      where: { id: { in: productIds }, storeId: store.id },
      data: { isActive: active },
    })
    return { updated: productIds.length, isActive: active }
  }

  async bulkUpdate(userId: string, productIds: string[], data: {
    basePrice?: number
    stock?: number
    isActive?: boolean
  }) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new ForbiddenException()

    const updateData: Record<string, any> = {}
    if (data.basePrice !== undefined) updateData.basePrice = data.basePrice
    if (data.stock !== undefined) updateData.stock = data.stock
    if (data.isActive !== undefined) updateData.isActive = data.isActive

    const result = await this.prisma.product.updateMany({
      where: { id: { in: productIds }, storeId: store.id },
      data: updateData,
    })
    return { updated: result.count }
  }
}
