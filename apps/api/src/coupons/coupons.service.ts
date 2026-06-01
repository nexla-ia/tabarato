import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CreateCouponDto } from './dto/create-coupon.dto'

@Injectable()
export class CouponsService {
  constructor(private prisma: PrismaService) {}

  private async getStoreByUser(userId: string) {
    const store = await this.prisma.store.findUnique({ where: { userId } })
    if (!store) throw new NotFoundException('Loja não encontrada')
    return store
  }

  async create(userId: string, dto: CreateCouponDto) {
    const store = await this.getStoreByUser(userId)

    if (!dto.discountPercent && !dto.discountFixed) {
      throw new BadRequestException('Informe discountPercent ou discountFixed')
    }
    if (dto.discountPercent && dto.discountFixed) {
      throw new BadRequestException('Use apenas um tipo de desconto por cupom')
    }

    const existing = await this.prisma.coupon.findUnique({ where: { code: dto.code.toUpperCase() } })
    if (existing) throw new BadRequestException('Código já cadastrado')

    return this.prisma.coupon.create({
      data: {
        ...dto,
        code: dto.code.toUpperCase(),
        storeId: store.id,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    })
  }

  async findByStore(userId: string) {
    const store = await this.getStoreByUser(userId)
    return this.prisma.coupon.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: 'desc' },
    })
  }

  async remove(userId: string, couponId: string) {
    const store = await this.getStoreByUser(userId)
    const coupon = await this.prisma.coupon.findFirst({ where: { id: couponId, storeId: store.id } })
    if (!coupon) throw new NotFoundException('Cupom não encontrado')
    await this.prisma.coupon.delete({ where: { id: couponId } })
    return { ok: true }
  }

  async toggle(userId: string, couponId: string) {
    const store = await this.getStoreByUser(userId)
    const coupon = await this.prisma.coupon.findFirst({ where: { id: couponId, storeId: store.id } })
    if (!coupon) throw new NotFoundException('Cupom não encontrado')
    return this.prisma.coupon.update({
      where: { id: couponId },
      data: { isActive: !coupon.isActive },
    })
  }

  // Called by orders service — validates and returns the coupon
  async validate(code: string, userId: string, subtotal: number, storeId: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: code.toUpperCase() } })

    if (!coupon || !coupon.isActive) throw new BadRequestException('Cupom inválido ou inativo')
    if (coupon.storeId && coupon.storeId !== storeId) throw new BadRequestException('Cupom não válido para esta loja')
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new BadRequestException('Cupom expirado')
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) throw new BadRequestException('Cupom esgotado')
    if (coupon.minOrderValue && subtotal < coupon.minOrderValue) {
      throw new BadRequestException(`Pedido mínimo de R$ ${coupon.minOrderValue.toFixed(2)} para usar este cupom`)
    }

    const alreadyUsed = await this.prisma.couponUse.findFirst({ where: { couponId: coupon.id, userId } })
    if (alreadyUsed) throw new BadRequestException('Você já utilizou este cupom')

    const discount = coupon.discountPercent
      ? Math.min(subtotal * (coupon.discountPercent / 100), subtotal)
      : Math.min(coupon.discountFixed ?? 0, subtotal)

    return { coupon, discount: Math.round(discount * 100) / 100 }
  }

  // Public endpoint — just validates without consuming (for checkout preview)
  async validatePublic(code: string, userId: string, subtotal: number, storeId: string) {
    const { coupon, discount } = await this.validate(code, userId, subtotal, storeId)
    return {
      code: coupon.code,
      description: coupon.description,
      discountPercent: coupon.discountPercent,
      discountFixed: coupon.discountFixed,
      discount,
    }
  }
}
