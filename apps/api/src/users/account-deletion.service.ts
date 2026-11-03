import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { OrderStatus, DeliveryStatus } from '@prisma/client'
import { randomBytes } from 'crypto'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'

const PEDIDO_ATIVO: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PICKED_UP']
const ENTREGA_ATIVA: DeliveryStatus[] = [
  'SEARCHING_COURIER', 'COURIER_ASSIGNED', 'COURIER_HEADING_TO_STORE', 'COURIER_AT_STORE', 'PICKED_UP', 'HEADING_TO_CLIENT',
]
const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Exclusão de conta pelo próprio usuário — a App Store (5.1.1(v)) e o Google Play
 * exigem que dê para fazer isso de dentro do app.
 *
 * A linha do usuário NÃO é apagada: pedidos, avaliações, repasses e notas apontam
 * para ela e parte disso tem guarda obrigatória (fiscal, Marco Civil). O que
 * identifica a pessoa é apagado ou sobrescrito, e a conta não entra mais. Dados de
 * loja (CNPJ) e de entregador (CPF/CNH) ficam guardados pelo mesmo motivo legal,
 * mas a loja sai do ar e o entregador fica fora da fila.
 *
 * Antes de excluir, tudo que deixaria dinheiro ou pedido no meio do caminho
 * bloqueia — com o motivo escrito, para a pessoa saber o que resolver.
 */
@Injectable()
export class AccountDeletionService {
  constructor(private prisma: PrismaService) {}

  /** O que impede a exclusão agora. Lista vazia = pode excluir. */
  async impedimentos(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true, deletedAt: true,
        store: { select: { id: true } },
        courier: { select: { id: true } },
      },
    })
    if (!user || user.deletedAt) throw new NotFoundException('Conta não encontrada.')

    const motivos: string[] = []
    if (user.role === 'ADMIN') {
      motivos.push('Conta de administrador não pode ser excluída pelo app. Peça a outro administrador para desativá-la.')
      return motivos
    }

    if (await this.prisma.order.count({ where: { userId, status: { in: PEDIDO_ATIVO } } })) {
      motivos.push('Você tem um pedido em andamento. Espere ele ser entregue ou cancelado.')
    }

    const agora = new Date()
    const anuncio = await this.prisma.ad.findFirst({
      where: { userId, status: 'PAID', endsAt: { gt: agora } },
      select: { endsAt: true },
      orderBy: { endsAt: 'desc' },
    })
    if (anuncio?.endsAt) {
      motivos.push(`Você tem um anúncio pago que vai até ${anuncio.endsAt.toLocaleDateString('pt-BR')}. Exclua a conta depois que ele terminar.`)
    }

    if (user.store) {
      const storeId = user.store.id
      if (await this.prisma.order.count({ where: { storeId, status: { in: PEDIDO_ATIVO } } })) {
        motivos.push('Sua loja tem pedidos em andamento. Finalize-os antes de excluir a conta.')
      }
      await this.checarCarteira(motivos, storeId, 'STORE', 'Sua loja')
    }

    if (user.courier) {
      const courierId = user.courier.id
      if (await this.prisma.delivery.count({ where: { courierId, status: { in: ENTREGA_ATIVA } } })) {
        motivos.push('Você tem uma entrega em andamento. Conclua-a antes de excluir a conta.')
      }
      await this.checarCarteira(motivos, courierId, 'COURIER', 'Você')
    }

    return motivos
  }

  private async checarCarteira(motivos: string[], ownerId: string, ownerType: 'STORE' | 'COURIER', quem: string) {
    const carteira = await this.prisma.wallet.findUnique({
      where: { ownerId_ownerType: { ownerId, ownerType } },
      select: { balance: true },
    })
    const saldo = Number(carteira?.balance ?? 0)
    if (saldo >= 0.01) {
      motivos.push(`${quem} ainda tem ${reais(saldo)} na carteira. Faça o saque antes de excluir a conta.`)
    }
    const saquesAbertos = await this.prisma.withdrawal.count({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
        OR: [{ ownerType, ownerId }, ...(ownerType === 'COURIER' ? [{ courierId: ownerId }] : [])],
      },
    })
    if (saquesAbertos) motivos.push('Há um saque em processamento. Espere ele cair na sua conta.')
  }

  async excluir(userId: string) {
    const motivos = await this.impedimentos(userId)
    if (motivos.length) throw new BadRequestException(motivos.join(' '))

    // Senha inutilizável e passwordChangedAt = agora: derruba qualquer sessão aberta
    // (o JwtStrategy recusa token emitido antes da troca de senha).
    const senhaMorta = await bcrypt.hash(randomBytes(24).toString('hex'), 10)
    const agora = new Date()

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          name: 'Conta excluída',
          email: `excluida-${userId}@contas-excluidas.tabaratoapp.com.br`,
          phone: null,
          cpf: null,
          avatarUrl: null,
          city: null,
          state: null,
          pushToken: null,
          asaasCustomerId: null,
          referralCode: null,
          appleSub: null,
          passwordHash: senhaMorta,
          passwordChangedAt: agora,
          isActive: false,
          deletedAt: agora,
        },
        select: { store: { select: { id: true } }, courier: { select: { id: true } } },
      })

      // Endereço usado em pedido não pode sumir (o pedido aponta para ele): fica só
      // bairro/cidade, para relatório da loja. O resto é apagado de vez.
      await tx.address.updateMany({
        where: { userId, orders: { some: {} } },
        data: {
          label: 'Endereço removido', street: 'Endereço removido', number: '-', complement: null,
          zipCode: '00000000', lat: 0, lng: 0, isDefault: false,
        },
      })
      await tx.address.deleteMany({ where: { userId, orders: { none: {} } } })
      await tx.favorite.deleteMany({ where: { userId } })
      await tx.notification.deleteMany({ where: { recipientId: userId } })
      await tx.passwordReset.deleteMany({ where: { userId } })
      // Pedido de Bíblia é dado sensível (convicção religiosa, LGPD art. 5º, II).
      await tx.bibleRequest.deleteMany({ where: { userId } })
      await tx.ad.updateMany({
        where: { userId, status: { in: ['PENDING_REVIEW', 'AWAITING_PAYMENT'] } },
        data: { status: 'CANCELLED' },
      })

      if (user.store) {
        await tx.store.update({
          where: { id: user.store.id },
          data: { status: 'SUSPENDED', isOpen: false },
        })
      }
      if (user.courier) {
        await tx.courier.update({
          where: { id: user.courier.id },
          data: { status: 'SUSPENDED', isOnline: false, currentLat: null, currentLng: null },
        })
      }
    })
    return { ok: true }
  }
}
