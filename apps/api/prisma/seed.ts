import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const categories = [
  { name: 'Restaurantes', icon: '🍽️', sortOrder: 1 },
  { name: 'Lanches', icon: '🍔', sortOrder: 2 },
  { name: 'Pizzaria', icon: '🍕', sortOrder: 3 },
  { name: 'Padaria', icon: '🥐', sortOrder: 4 },
  { name: 'Mercado', icon: '🛒', sortOrder: 5 },
  { name: 'Bebidas', icon: '🥤', sortOrder: 6 },
  { name: 'Farmácia', icon: '💊', sortOrder: 7 },
  { name: 'Açaí', icon: '🍇', sortOrder: 8 },
  { name: 'Sorvetes', icon: '🍦', sortOrder: 9 },
  { name: 'Pet Shop', icon: '🐾', sortOrder: 10 },
  { name: 'Saúde e Beleza', icon: '💄', sortOrder: 11 },
  { name: 'Outros', icon: '📦', sortOrder: 12 },
]

async function main() {
  console.log('Semeando categorias...')
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    })
  }
  console.log(`✅ ${categories.length} categorias criadas/atualizadas.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
