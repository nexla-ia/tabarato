import {
  Body, Controller, Get, Post, UseGuards, UseInterceptors,
  UploadedFile, BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Throttle } from '@nestjs/throttler'
import { memoryStorage } from 'multer'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { UploadsService } from './uploads.service'
import { FundoBrancoService } from './fundo-branco.service'
import { FundoBrancoDto } from './dto/fundo-branco.dto'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploadsService: UploadsService,
    private readonly fundoBranco: FundoBrancoService,
  ) {}

  /** O app pergunta antes de mostrar o botao: sem a chave da Bria, nao aparece. */
  @UseGuards(JwtAuthGuard)
  @Get('white-background/status')
  statusFundoBranco() {
    return { enabled: this.fundoBranco.ativo }
  }

  /**
   * Foto do produto com fundo branco padronizado.
   *
   * So lojista: cada chamada custa dinheiro na Bria, e cliente ou entregador
   * nao tem por que usar. O limite por minuto e mais baixo que o do upload
   * comum pelo mesmo motivo.
   */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STORE_OWNER')
  @Post('image/white-background')
  async deixarFundoBranco(@Body() dto: FundoBrancoDto) {
    const url = await this.fundoBranco.deixarFundoBranco(dto.imageUrl)
    return { url }
  }

  // Anti-abuso: no máx. 20 uploads/min por usuário (evita floodar o Storage).
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseGuards(JwtAuthGuard)
  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_TYPES.includes(file.mimetype)) {
          return cb(new BadRequestException('Formato inválido. Use JPEG, PNG, WEBP ou PDF.'), false)
        }
        cb(null, true)
      },
    }),
  )
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.')
    const url = await this.uploadsService.uploadImage(file)
    return { url }
  }

  // Documentos do entregador (CNH/RG/doc. veículo) — vão para o bucket PRIVADO.
  // Só COURIER pode subir; devolve o PATH (não uma URL pública), que fica salvo
  // no cadastro. O admin vê via signed URL gerada só na hora da conferência.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('COURIER')
  @Post('document')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_TYPES.includes(file.mimetype)) {
          return cb(new BadRequestException('Formato inválido. Use JPEG, PNG, WEBP ou PDF.'), false)
        }
        cb(null, true)
      },
    }),
  )
  async uploadDocument(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.')
    const path = await this.uploadsService.uploadDocument(file)
    return { path }
  }
}
