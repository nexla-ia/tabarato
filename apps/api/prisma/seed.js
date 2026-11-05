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
  { name: 'Açaí', icon: 'leaf', sortOrder: 5 },
  { name: 'Sorvetes', icon: 'ice-cream', sortOrder: 6 },
  { name: 'Sushi', icon: 'fish', sortOrder: 7 },
  { name: 'Marmita', icon: 'restaurant-outline', sortOrder: 8 },
  { name: 'Churrasco', icon: 'flame', sortOrder: 9 },
  { name: 'Bebidas', icon: 'wine', sortOrder: 10 },
  // Mercado & Farmácia
  { name: 'Mercado', icon: 'cart', sortOrder: 11 },
  { name: 'Farmácia', icon: 'medical', sortOrder: 12 },
  { name: 'Hortifruti', icon: 'nutrition', sortOrder: 13 },
  // Moda & Beleza
  { name: 'Moda, calçados e acessórios', icon: 'shirt', sortOrder: 14 },
  { name: 'Perfumaria, cosméticos e cuidados pessoais', icon: 'rose', sortOrder: 16 },
  { name: 'Barbearia', icon: 'cut', sortOrder: 17 },
  // Tecnologia & Serviços
  { name: 'Eletrônicos e eletrodomésticos', icon: 'tv', sortOrder: 18 },
  { name: 'Informática', icon: 'laptop', sortOrder: 19 },
  { name: 'Papelaria e escritório', icon: 'book', sortOrder: 20 },
  // Casa & Auto
  { name: 'Móveis e decoração', icon: 'bed', sortOrder: 21 },
  { name: 'Materiais de construção', icon: 'construct', sortOrder: 22 },
  { name: 'Autopeças', icon: 'car', sortOrder: 23 },
  // Outros
  { name: 'Artigos pet', icon: 'paw', sortOrder: 24 },
  { name: 'Flores e Presentes', icon: 'gift', sortOrder: 25 },
  { name: 'Artigos esportivos', icon: 'football', sortOrder: 26 },
  { name: 'Farmácia de Manipulação', icon: 'flask', sortOrder: 27 },
  { name: 'Ótica', icon: 'glasses', sortOrder: 28 },
  { name: 'Ferramentas', icon: 'hammer', sortOrder: 29 },
  { name: 'Acessórios', icon: 'watch', sortOrder: 30 },
  { name: 'Gás de cozinha', icon: 'flame-outline', sortOrder: 31 },
  { name: 'Brinquedos e jogos', icon: 'game-controller', sortOrder: 32 },
  { name: 'Instrumentos musicais', icon: 'musical-notes', sortOrder: 33 },
  { name: 'Produtos de limpeza', icon: 'sparkles', sortOrder: 34 },
  { name: 'Casa', icon: 'home', sortOrder: 35 },
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
