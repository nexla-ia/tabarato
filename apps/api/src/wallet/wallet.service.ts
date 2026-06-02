import { BadRequestException, Injectable } from '@nestjs/common'
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

  async debit(ownerId: string, ownerType: WalletOwnerType, amount: number, description: string, referenceId?: string) {
    // Balance check inside the transaction to prevent double-spend race condition
    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findFirst({
        where: { ownerId, ownerType },
      })

      if (!wallet) throw new BadRequestException('Carteira não encontrada.')

      // Prisma Decimal comes as a string or Decimal object; compare safely
      const currentBalance = Number(wallet.balance)
      if (currentBalance < amount) {
        throw new BadRequestException('Saldo insuficiente para o saque solicitado.')
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } },
      })

      await tx.transaction.create({
        data: { walletId: wallet.id, amount, type: 'DEBIT', description, referenceId },
      })
    })
  }

  async findByOwner(ownerId: string, ownerType: WalletOwnerType) {
    const wallet = await this.getOrCreate(ownerId, ownerType)
    const transactions = await this.prisma.transaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    return { balance: Number(wallet.balance), transactions }
  }
}
