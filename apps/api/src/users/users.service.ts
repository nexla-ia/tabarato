import { Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { UpdateUserDto } from './dto/update-user.dto'
import { CreateAddressDto } from './dto/create-address.dto'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Retorna o código de indicação do usuário, gerando e persistindo um se ainda
   * não existir (usuários antigos ficaram sem código). Idempotente.
   */
  async ensureReferralCode(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } })
    if (!u) throw new NotFoundException('User not found')
    if (u.referralCode) return u.referralCode
    // Tenta gerar um código único (colisão é raríssima; retenta poucas vezes).
    for (let i = 0; i < 5; i++) {
      const code = randomBytes(4).toString('hex').toUpperCase()
      try {
        await this.prisma.user.update({ where: { id: userId }, data: { referralCode: code } })
        return code
      } catch { /* colisão de unique — tenta de novo */ }
    }
    throw new NotFoundException('Não foi possível gerar o código de indicação.')
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        avatarUrl: true,
        city: true,
        state: true,
        referralCode: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    if (!user) throw new NotFoundException('User not found')
    return user
  }

  async update(id: string, dto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        avatarUrl: true,
        city: true,
        state: true,
        referralCode: true,
        updatedAt: true,
      },
    })
  }

  async updatePushToken(userId: string, token: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pushToken: token },
    })
    return { ok: true }
  }

  async listAddresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    })
  }

  async addAddress(userId: string, dto: CreateAddressDto) {
    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      })
    }
    return this.prisma.address.create({
      data: { ...dto, userId },
    })
  }

  async updateAddress(userId: string, addressId: string, dto: Partial<CreateAddressDto>) {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    })
    if (!address) throw new NotFoundException('Address not found')

    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      })
    }

    return this.prisma.address.update({
      where: { id: addressId },
      data: dto,
    })
  }

  async deleteAddress(userId: string, addressId: string) {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    })
    if (!address) throw new NotFoundException('Address not found')
    await this.prisma.address.delete({ where: { id: addressId } })
  }
}
