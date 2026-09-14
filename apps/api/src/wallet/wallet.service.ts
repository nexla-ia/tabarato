import { BadRequestException, Injectable } from '@nestjs/common'
import { WalletOwnerType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Esconde do extrato os pares saque/estorno que se anulam (saque que falhou): o
 * débito `saque-<id>` e o crédito `estorno-saque-<id>` só confundem. Saques
 * concluídos (sem estorno) continuam aparecendo. Compartilhado por loja e entregador.
 */
export function hideReversedWithdrawals<T extends { referenceId?: string | null }>(txs: T[]): T[] {
  const reversed = new Set<string>()
  for (const t of txs) {
    const m = t.referenceId?.match(/^estorno-saque-(.+)$/)
    if (m) reversed.add(m[1])
  }
  return txs.filter((t) => {
    const ref = t.referenceId ?? ''
    if (/^estorno-saque-/.test(ref)) return false
    const deb = ref.match(/^saque-(.+)$/)
    if (deb && reversed.has(deb[1])) return false
    return true
  })
}

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

  /** Garante que o valor é um número finito e estritamente positivo. */
  private safeAmount(amount: number): number {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) {
      throw new BadRequestException('Valor inválido.')
    }
    // Normaliza para centavos (evita floats com muitas casas)
    return Math.round(n * 100) / 100
  }

  async credit(ownerId: string, ownerType: WalletOwnerType, amount: number, description: string, referenceId?: string) {
    amount = this.safeAmount(amount)
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
    amount = this.safeAmount(amount)
    const wallet = await this.getOrCreate(ownerId, ownerType)

    await this.prisma.$transaction(async (tx) => {
      // Débito atômico condicional: o WHERE balance >= amount + o decrement são um
      // único UPDATE, então duas requisições simultâneas não conseguem gastar 2×.
      const res = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      })
      if (res.count === 0) {
        throw new BadRequestException('Saldo insuficiente para o saque solicitado.')
      }
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
