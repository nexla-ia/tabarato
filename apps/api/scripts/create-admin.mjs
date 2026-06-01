import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const DIRECT_URL = 'postgresql://postgres:XzNpMrSVGMhjUjAz@db.bxhuwnzecikksoamavtl.supabase.co:5432/postgres'
const adapter = new PrismaPg({ connectionString: DIRECT_URL })
const prisma = new PrismaClient({ adapter })

const EMAIL = 'adm@tabarato.com'
const PASSWORD = 'TabAdmin@2026'

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } })
  if (existing) {
    const updated = await prisma.user.update({ where: { email: EMAIL }, data: { role: 'ADMIN' } })
    console.log('Usuário já existia — role atualizado para ADMIN:', updated.email)
    return
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10)
  const user = await prisma.user.create({
    data: {
      name: 'Admin',
      email: EMAIL,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    },
  })
  console.log('✅ Admin criado com sucesso!')
  console.log('   Email:', user.email)
  console.log('   Senha:', PASSWORD)
  console.log('   Role:', user.role)
}

main()
  .catch(e => { console.error('Erro:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
