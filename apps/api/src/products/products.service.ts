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

  async findByStore(storeId: string) {
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
    return product
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
}
