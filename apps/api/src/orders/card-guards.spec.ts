import { BadRequestException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { assertExpectedTotal, assertInstallments, termsForProvider } from './orders.service'
import { paymentCharges, PaymentTerms } from '../payments/card-plan'
import { CreateOrderDto } from './dto/create-order.dto'

const terms: PaymentTerms = {
  maxInstallments: 10, freeInstallments: 6, interestMonthlyPct: 2.99,
  cardFeePct1x: 2.99, cardFeePct2to6: 3.49, cardFeePct7to12: 3.99, cardFeeFixed: 0.49, pixFee: 0,
}

describe('proteções do parcelamento', () => {
  it('sem juros: não exige o total do app (app antigo continua funcionando)', () => {
    const c = paymentCharges('CREDIT_CARD', 6, [100], terms)
    expect(() => assertExpectedTotal(c, undefined)).not.toThrow()
  })

  it('com juros e app antigo (sem expectedTotal): recusa em vez de cobrar a mais', () => {
    const c = paymentCharges('CREDIT_CARD', 10, [100], terms)
    expect(() => assertExpectedTotal(c, undefined)).toThrow(BadRequestException)
  })

  it('com juros: aceita só se o total mostrado bater', () => {
    const c = paymentCharges('CREDIT_CARD', 10, [100], terms)
    expect(() => assertExpectedTotal(c, 117.2)).not.toThrow()
    expect(() => assertExpectedTotal(c, 100)).toThrow(BadRequestException)
  })

  it('Mercado Pago (legado): sem juros nosso, nunca juros em dobro', () => {
    const c = paymentCharges('CREDIT_CARD', 10, [100], termsForProvider(terms, false))
    expect(c.chargedTotal).toBe(100)
    expect(c.perOrder[0].interest).toBe(0)
    expect(termsForProvider(terms, true)).toBe(terms)
  })

  it('parcelas acima do permitido para o valor são recusadas', () => {
    expect(() => assertInstallments('CREDIT_CARD', 11, 1000, terms)).toThrow('até 10x')
    expect(() => assertInstallments('CREDIT_CARD', 5, 20, terms)).toThrow('até 4x')
    expect(() => assertInstallments('CREDIT_CARD', 2, 9, terms)).toThrow('só à vista')
    expect(() => assertInstallments('CREDIT_CARD', 10, 100, terms)).not.toThrow()
    expect(() => assertInstallments('PIX', 10, 9, terms)).not.toThrow()
  })
})

describe('validação do pedido (DTO)', () => {
  const erros = (extra: Record<string, unknown>) =>
    validateSync(plainToInstance(CreateOrderDto, { addressId: 'a', paymentMethod: 'CREDIT_CARD', ...extra }))
      .filter((e) => ['installments', 'expectedTotal'].includes(e.property))
      .map((e) => e.property)

  it('parcelas precisam ser inteiras, de 1 a 21', () => {
    expect(erros({ installments: 1.5 })).toContain('installments')
    expect(erros({ installments: 0 })).toContain('installments')
    expect(erros({ installments: -3 })).toContain('installments')
    expect(erros({ installments: 22 })).toContain('installments')
    expect(erros({ installments: '3' })).toContain('installments')
    expect(erros({ installments: 10 })).toEqual([])
  })

  it('total esperado: número com até 2 casas, não negativo', () => {
    expect(erros({ expectedTotal: -1 })).toContain('expectedTotal')
    expect(erros({ expectedTotal: 10.123 })).toContain('expectedTotal')
    expect(erros({ expectedTotal: 'abc' })).toContain('expectedTotal')
    expect(erros({ expectedTotal: 117.2 })).toEqual([])
  })
})
