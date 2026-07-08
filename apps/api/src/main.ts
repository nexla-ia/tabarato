import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // rawBody needed for MP webhook signature verification
    rawBody: true,
  })

  // Origins extras via env (ex.: domínio da plataforma web após o deploy).
  // Aceita múltiplos separados por vírgula. São SOMADOS aos defaults abaixo
  // (não substituem) — assim o admin continua funcionando ao adicionar a web.
  const envOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)

  const allowedOrigins: (string | RegExp)[] = [
    'https://admin-production-41b2.up.railway.app',
    'https://api-production-b730d.up.railway.app',
    /^http:\/\/localhost(:\d+)?$/,
    ...envOrigins,
  ]

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  })

  app.setGlobalPrefix('api')
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))

  // ── OpenAPI / Swagger docs (served at /api/docs) ──────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Tá Barato — API')
    .setDescription(
      'API REST do marketplace Tá Barato (consumidor, lojista, entregador e admin). ' +
        'Autenticação via Bearer JWT no header Authorization.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'jwt',
    )
    .addTag('auth', 'Autenticação e cadastro')
    .addTag('users', 'Perfil, endereços e push token')
    .addTag('stores', 'Lojas e catálogo')
    .addTag('products', 'Produtos e variações')
    .addTag('orders', 'Pedidos e histórico')
    .addTag('payments', 'Pagamentos PIX/cartão')
    .addTag('couriers', 'Entregadores e entregas')
    .addTag('coupons', 'Cupons de desconto')
    .addTag('loyalty', 'Programa de fidelidade')
    .addTag('admin', 'Painel administrativo')
    .build()
  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('api/docs', app, swaggerDoc, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'Tá Barato — API Docs',
  })

  const port = process.env.PORT ?? 3000
  await app.listen(port, '0.0.0.0')
  console.log(`API rodando na porta ${port}`)
}

bootstrap()
