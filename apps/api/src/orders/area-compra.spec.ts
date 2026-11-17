import { BadRequestException } from '@nestjs/common'
import { conferirAreaDaCompra } from './orders.service'

// Coordenadas reais (aprox.): centro de Vilhena, um bairro de Vilhena e Porto Velho.
const VILHENA = { lat: -12.7406, lng: -60.1458 }
const BAIRRO_VILHENA = { lat: -12.7600, lng: -60.1200 } // ~3,5 km do centro
const PORTO_VELHO = { lat: -8.7612, lng: -63.9004 }

const loja = { name: 'Loja Teste', ...VILHENA, deliveryRadiusKm: 5 }

describe('conferirAreaDaCompra', () => {
  const antes = process.env.EXIGIR_LOCAL_NA_COMPRA
  afterEach(() => { process.env.EXIGIR_LOCAL_NA_COMPRA = antes })

  it('deixa comprar quem está na cidade, com endereço na cidade', () => {
    expect(() => conferirAreaDaCompra(loja, BAIRRO_VILHENA, false, VILHENA)).not.toThrow()
  })

  it('barra quem está em Porto Velho e pôs endereço de Vilhena', () => {
    expect(() => conferirAreaDaCompra(loja, BAIRRO_VILHENA, false, PORTO_VELHO))
      .toThrow(/Você está a \d+ km da loja/)
  })

  it('barra retirada na loja feita de outra cidade', () => {
    expect(() => conferirAreaDaCompra(loja, PORTO_VELHO, true, PORTO_VELHO)).toThrow(BadRequestException)
  })

  it('retirada não confere o endereço, só onde o celular está', () => {
    expect(() => conferirAreaDaCompra(loja, PORTO_VELHO, true, VILHENA)).not.toThrow()
  })

  it('barra endereço fora do raio de entrega mesmo sem a localização do celular', () => {
    delete process.env.EXIGIR_LOCAL_NA_COMPRA
    expect(() => conferirAreaDaCompra(loja, PORTO_VELHO, false, undefined))
      .toThrow(/não entrega nesse endereço/)
  })

  it('aceita a beira do raio (folga para o erro do GPS)', () => {
    const lojaRaio2 = { ...loja, deliveryRadiusKm: 2 } // bairro a ~3,5 km: dentro de 2 + folga
    expect(() => conferirAreaDaCompra(lojaRaio2, BAIRRO_VILHENA, false, BAIRRO_VILHENA)).not.toThrow()
  })

  it('sem localização do celular: passa enquanto a exigência está desligada (APK antigo)', () => {
    delete process.env.EXIGIR_LOCAL_NA_COMPRA
    expect(() => conferirAreaDaCompra(loja, BAIRRO_VILHENA, false, undefined)).not.toThrow()
  })

  it('sem localização do celular: recusa quando EXIGIR_LOCAL_NA_COMPRA=true', () => {
    process.env.EXIGIR_LOCAL_NA_COMPRA = 'true'
    expect(() => conferirAreaDaCompra(loja, BAIRRO_VILHENA, false, undefined))
      .toThrow(/Ative a localização/)
  })
})
