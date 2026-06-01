require('dotenv/config')
const { PrismaPg } = require('@prisma/adapter-pg')
const { PrismaClient } = require('@prisma/client')

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const categories = [
  // Alimentação
  { name: 'Restaurantes', icon: 'restaurant', sortOrder: 1 },
  { name: 'Lanches', icon: 'fast-food', sortOrder: 2 },
  { name: 'Pizzaria', icon: 'pizza', sortOrder: 3 },
  { name: 'Padaria', icon: 'cafe', sortOrder: 4 },
  { name: 'Acai', icon: 'leaf', sortOrder: 5 },
  { name: 'Sorvetes', icon: 'ice-cream', sortOrder: 6 },
  { name: 'Sushi', icon: 'fish', sortOrder: 7 },
  { name: 'Marmita', icon: 'restaurant-outline', sortOrder: 8 },
  { name: 'Churrasco', icon: 'flame', sortOrder: 9 },
  { name: 'Bebidas', icon: 'wine', sortOrder: 10 },
  // Mercado & Farmácia
  { name: 'Mercado', icon: 'cart', sortOrder: 11 },
  { name: 'Farmacia', icon: 'medical', sortOrder: 12 },
  { name: 'Hortifruti', icon: 'nutrition', sortOrder: 13 },
  // Moda & Beleza
  { name: 'Roupas', icon: 'shirt', sortOrder: 14 },
  { name: 'Calcados', icon: 'footsteps', sortOrder: 15 },
  { name: 'Saude e Beleza', icon: 'heart', sortOrder: 16 },
  { name: 'Barbearia', icon: 'cut', sortOrder: 17 },
  // Tecnologia & Serviços
  { name: 'Eletronicos', icon: 'phone-portrait', sortOrder: 18 },
  { name: 'Informatica', icon: 'laptop', sortOrder: 19 },
  { name: 'Papelaria', icon: 'book', sortOrder: 20 },
  // Casa & Auto
  { name: 'Casa e Decoracao', icon: 'home', sortOrder: 21 },
  { name: 'Construcao', icon: 'construct', sortOrder: 22 },
  { name: 'Autopecas', icon: 'car', sortOrder: 23 },
  // Outros
  { name: 'Pet Shop', icon: 'paw', sortOrder: 24 },
  { name: 'Flores e Presentes', icon: 'gift', sortOrder: 25 },
  { name: 'Esportes', icon: 'football', sortOrder: 26 },
  { name: 'Farmacia de Manipulacao', icon: 'flask', sortOrder: 27 },
  { name: 'Otica', icon: 'glasses', sortOrder: 28 },
  { name: 'Outros', icon: 'cube', sortOrder: 99 },
]

Promise.all(
  categories.map((cat) =>
    prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    })
  )
)
  .then((r) => {
    console.log(r.length + ' categorias criadas/atualizadas.')
    return prisma.$disconnect()
  })
  .catch((e) => {
    console.error(e)
    return prisma.$disconnect()
  })
