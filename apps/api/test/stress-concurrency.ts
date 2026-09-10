/**
 * Teste de ESTRESSE de concorrência do motoboy — dispara N operações simultâneas
 * REAIS contra um Postgres real e verifica os invariantes das correções da auditoria
 * (atomicidade que os testes com mock não conseguem provar):
 *
 *   1) Aceite concorrente na MESMA corrida  → exatamente 1 entregador vence.
 *   2) Brute-force paralelo do código        → tentativas travam em 5 (nunca passam).
 *   3) 1 entregador aceitando 2 corridas     → termina com no máximo 1 ativa.
 *
 * Uso (banco de TESTE, NUNCA produção):
 *   STRESS_DATABASE_URL="postgresql://user:pass@localhost:5432/tabarato_test" \
 *     npx ts-node -r tsconfig-paths/register test/stress-concurrency.ts
 */
import { PrismaClient } from '@prisma/client'
import { CouriersService } from '../src/couriers/couriers.service'

const URL = process.env.STRESS_DATABASE_URL
if (!URL) {
  console.error('❌ Defina STRESS_DATABASE_URL apontando para um banco de TESTE (nunca produção).')
  process.exit(1)
}
if (/supabase|railway/i.test(URL)) {
  console.error('❌ A URL parece ser de PRODUÇÃO (supabase/railway). Use um banco de teste local.')
  process.exit(1)
}

const prisma = new PrismaClient({ datasources: { db: { url: URL } } })
const N = Number(process.env.STRESS_N ?? 50)
const TAG = `stress-${Date.now()}`

// Serviço real com Prisma real; dependências que NÃO são tocadas nos caminhos
// testados ficam como stubs (o aceite só usa prisma; o código errado lança antes
// de qualquer wallet/transaction).
function makeService() {
  return new CouriersService(
    prisma as any,
    { send: () => {} } as any,                         // push
    { credit: async () => {}, debit: async () => {} } as any, // wallet
    {} as any, {} as any,                               // notifications, loyalty
    { get: () => undefined } as any,                    // config
    {} as any,                                          // mpOauth
    { enabled: false } as any,                          // asaas
    { signDocuments: async () => ({}) } as any,         // uploads
    { commissionFor: async () => 0, courierFeeFor: async () => 5, get: async () => ({}) } as any, // settings
    undefined as any, undefined as any,                 // matching, gateway (@Optional)
  )
}

const created = { deliveries: [] as string[], orders: [] as string[], addresses: [] as string[], couriers: [] as string[], users: [] as string[], stores: [] as string[] }
const LAT = -12.74, LNG = -60.14 // Vilhena-RO

async function makeCourier(i: number) {
  const user = await prisma.user.create({ data: { name: `SC${i}`, email: `${TAG}-c${i}@t.test`, passwordHash: 'x', role: 'COURIER' } })
  created.users.push(user.id)
  const courier = await prisma.courier.create({
    data: {
      userId: user.id, cpf: `${TAG}-cpf${i}`, cnh: `${TAG}-cnh${i}`, vehiclePlate: 'ABC1D23',
      status: 'APPROVED', isOnline: true, currentLat: LAT, currentLng: LNG,
    },
  })
  created.couriers.push(courier.id)
  return { userId: user.id, courierId: courier.id }
}

async function makeStoreAndConsumer() {
  const owner = await prisma.user.create({ data: { name: `${TAG}-owner`, email: `${TAG}-owner@t.test`, passwordHash: 'x', role: 'STORE_OWNER' } })
  created.users.push(owner.id)
  const store = await prisma.store.create({
    data: { userId: owner.id, cnpj: `${TAG}-cnpj`, name: 'Loja Stress', lat: LAT, lng: LNG, address: 'Centro', status: 'APPROVED' },
  })
  created.stores.push(store.id)
  const consumer = await prisma.user.create({ data: { name: `${TAG}-cons`, email: `${TAG}-cons@t.test`, passwordHash: 'x', role: 'CONSUMER' } })
  created.users.push(consumer.id)
  const address = await prisma.address.create({
    data: { userId: consumer.id, label: 'Casa', street: 'Rua X', number: '100', district: 'Centro', city: 'Vilhena', state: 'RO', zipCode: '76980000', lat: LAT, lng: LNG },
  })
  created.addresses.push(address.id)
  return { storeId: store.id, consumerId: consumer.id, addressId: address.id }
}

async function makeDelivery(base: { storeId: string; consumerId: string; addressId: string }, opts: { status?: any; courierId?: string; deliveryCode?: string } = {}) {
  const order = await prisma.order.create({
    data: {
      userId: base.consumerId, storeId: base.storeId, addressId: base.addressId,
      subtotal: 20, deliveryFee: 5, total: 25, status: 'CONFIRMED',
      deliveryCode: opts.deliveryCode ?? null,
    },
  })
  created.orders.push(order.id)
  const delivery = await prisma.delivery.create({
    data: { orderId: order.id, distanceKm: 1, courierFee: 5, status: opts.status ?? 'SEARCHING_COURIER', courierId: opts.courierId ?? null },
  })
  created.deliveries.push(delivery.id)
  return { orderId: order.id, deliveryId: delivery.id }
}

const results: { name: string; ok: boolean; detail: string }[] = []
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name} — ${detail}`)
}

async function scenarioAcceptRace(svc: CouriersService, base: any) {
  const couriers = await Promise.all(Array.from({ length: N }, (_, i) => makeCourier(i)))
  const { deliveryId } = await makeDelivery(base)
  const settled = await Promise.allSettled(couriers.map((c) => svc.acceptDelivery(c.userId, deliveryId)))
  const won = settled.filter((s) => s.status === 'fulfilled').length
  const d = await prisma.delivery.findUnique({ where: { id: deliveryId } })
  check('Aceite concorrente na mesma corrida', won === 1 && !!d?.courierId,
    `${N} aceites simultâneos → ${won} venceu(ram); courierId=${d?.courierId ? 'atribuído' : 'nulo'}`)
  return couriers
}

async function scenarioCodeBruteForce(svc: CouriersService, base: any, courier: { userId: string; courierId: string }) {
  const { orderId, deliveryId } = await makeDelivery(base, { status: 'PICKED_UP', courierId: courier.courierId, deliveryCode: '123456' })
  // N tentativas simultâneas com código ERRADO (todas devem lançar; nenhuma finaliza)
  const settled = await Promise.allSettled(
    Array.from({ length: N }, () => svc.advanceDelivery(courier.userId, deliveryId, undefined, '000000')),
  )
  const finished = settled.filter((s) => s.status === 'fulfilled').length
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  check('Brute-force paralelo do código de entrega', finished === 0 && order?.deliveryCodeAttempts === 5,
    `${N} tentativas erradas → finalizou ${finished}x; tentativas contadas=${order?.deliveryCodeAttempts} (esperado 5)`)
}

async function scenarioOneActive(svc: CouriersService, base: any, courier: { userId: string; courierId: string }) {
  const a = await makeDelivery(base)
  const b = await makeDelivery(base)
  await Promise.allSettled([
    svc.acceptDelivery(courier.userId, a.deliveryId),
    svc.acceptDelivery(courier.userId, b.deliveryId),
    svc.acceptDelivery(courier.userId, a.deliveryId),
    svc.acceptDelivery(courier.userId, b.deliveryId),
  ])
  const active = await prisma.delivery.count({
    where: { courierId: courier.courierId, status: { notIn: ['SEARCHING_COURIER', 'DELIVERED', 'FAILED'] } },
  })
  check('Uma entrega ativa por vez (claim-then-verify)', active <= 1,
    `entregador aceitou 2 corridas em paralelo → ${active} ativa(s) (esperado ≤ 1)`)
}

async function cleanup() {
  await prisma.delivery.deleteMany({ where: { id: { in: created.deliveries } } })
  await prisma.order.deleteMany({ where: { id: { in: created.orders } } })
  await prisma.address.deleteMany({ where: { id: { in: created.addresses } } })
  await prisma.courier.deleteMany({ where: { id: { in: created.couriers } } })
  await prisma.store.deleteMany({ where: { id: { in: created.stores } } })
  await prisma.user.deleteMany({ where: { id: { in: created.users } } })
}

async function main() {
  console.log(`\n🏋️  Teste de estresse (N=${N}) — banco: ${URL!.replace(/:[^:@/]+@/, ':***@')}\n`)
  const svc = makeService()
  try {
    const base = await makeStoreAndConsumer()
    const couriers = await scenarioAcceptRace(svc, base)
    // Reusa 1 entregador livre pros outros cenários (garante que não tem entrega ativa).
    const free = await makeCourier(9000)
    await scenarioCodeBruteForce(svc, base, free)
    const free2 = await makeCourier(9001)
    await scenarioOneActive(svc, base, free2)
    void couriers
  } finally {
    await cleanup()
    await prisma.$disconnect()
  }
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${failed.length === 0 ? '🎉 TODOS OS INVARIANTES PASSARAM' : `❌ ${failed.length} FALHA(S)`} (${results.length} cenários)\n`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((e) => { console.error('Erro no teste de estresse:', e); prisma.$disconnect().finally(() => process.exit(1)) })
