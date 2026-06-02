import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // rawBody needed for MP webhook signature verification
    rawBody: true,
  })

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [
        'https://admin-production-41b2.up.railway.app',
        'https://api-production-b730d.up.railway.app',
        // Next.js web (add after deploy)
        /^http:\/\/localhost(:\d+)?$/,
      ]

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  })

  app.setGlobalPrefix('api')
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))

  const port = process.env.PORT ?? 3000
  await app.listen(port, '0.0.0.0')
  console.log(`API rodando na porta ${port}`)
}

bootstrap()
