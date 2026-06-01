import { Injectable } from '@nestjs/common'
import { WalletOwnerType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async getOrCreate(ownerId: string, ownerType: WalletOwnerType) {
    return this.prisma.wallet.upsert({
      where: { ownerId_ownerType: { ownerId, ownerType } },
      update: {},
      create: { ownerId, ownerType, balance: 0 },
    })
  }

  async credit(ownerId: string, ownerType: WalletOwnerType, amount: number, description: string, referenceId?: string) {
    const wallet = await this.getOrCreate(ownerId, ownerType)
    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      }),
      this.prisma.transaction.create({
        data: { walletId: wallet.id, amount, type: 'CREDIT', description, referenceId },
      }),
    ])
  }

  async findByOwner(ownerId: string, ownerType: WalletOwnerType) {
    const wallet = await this.getOrCreate(ownerId, ownerType)
    const transactions = await this.prisma.transaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    return { balance: wallet.balance, transactions }
  }
}
