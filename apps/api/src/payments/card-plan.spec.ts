import { allocate, cardFeeFor, installmentPlan, maxInstallmentsFor, paymentCharges, PaymentTerms } from './card-plan'
import { storeShareOf } from '../orders/orders.service'

const terms: PaymentTerms = {
  maxInstallments: 10, freeInstallments: 6, interestMonthlyPct: 2.99,
  cardFeePct1x: 2.99, cardFeePct2to6: 3.49, cardFeePct7to12: 3.99, cardFeeFixed: 0.49, pixFee: 0,
}

describe('parcelamento', () => {
  it('até as parcelas sem juros, o total não muda', () => {
    const p = installmentPlan(100, 6, terms)
    expect(p).toMatchObject({ interest: 0, chargedTotal: 100, installmentValue: 16.67, interestFree: true })
  })

  it('acima das sem juros, aplica Tabela Price', () => {
    const p = installmentPlan(100, 10, terms)
    // PMT(2,99% a.m., 10x) sobre R$ 100 = R$ 11,72
    expect(p.installmentValue).toBe(11.72)
    expect(p.chargedTotal).toBe(117.2)
    expect(p.interest).toBe(17.2)
    expect(p.interestFree).toBe(false)
  })

  it('juros 0% deixa tudo sem juros', () => {
    expect(installmentPlan(100, 10, { ...terms, interestMonthlyPct: 0 }).interest).toBe(0)
  })

  it('parcela mínima de R$ 5 limita a quantidade', () => {
    expect(maxInstallmentsFor(100, terms)).toBe(10)
    expect(maxInstallmentsFor(23, terms)).toBe(4)
    expect(maxInstallmentsFor(4, terms)).toBe(1)
  })
})

describe('taxa do cartão (paga pela loja)', () => {
  it('usa a faixa certa', () => {
    expect(cardFeeFor(100, 1, terms)).toBe(3.48)
    expect(cardFeeFor(100, 6, terms)).toBe(3.98)
    expect(cardFeeFor(100, 7, terms)).toBe(4.48)
  })

  it('pedido de R$ 100 à vista: a loja recebe 90 − 3,48', () => {
    const c = paymentCharges('CREDIT_CARD', 1, [100], terms)
    expect(c.chargedTotal).toBe(100)
    const share = storeShareOf({ subtotal: 100, couponDiscount: 0, promoDiscount: 0, commission: 10, deliveryFee: 0, freeShipping: false, storeDelivers: false, installmentInterest: c.perOrder[0].interest, paymentFee: c.perOrder[0].fee })
    expect(share).toBe(86.52)
  })

  it('parcelado com juros: o juros vai para a loja e a comissão fica intacta', () => {
    const c = paymentCharges('CREDIT_CARD', 10, [100], terms)
    const { interest, fee } = c.perOrder[0]
    expect(interest).toBe(17.2)
    expect(fee).toBe(cardFeeFor(117.2, 10, terms))
    const share = storeShareOf({ subtotal: 100, couponDiscount: 0, promoDiscount: 0, commission: 10, deliveryFee: 0, freeShipping: false, storeDelivers: false, installmentInterest: interest, paymentFee: fee })
    // cliente paga 117,20; Asaas fica com a taxa; plataforma fica com os 10 de comissão
    expect(Math.round((c.chargedTotal - fee - share) * 100) / 100).toBe(10)
  })

  it('PIX: taxa configurável (0 = plataforma absorve)', () => {
    expect(paymentCharges('PIX', undefined, [50], terms).perOrder[0].fee).toBe(0)
    expect(paymentCharges('PIX', undefined, [50], { ...terms, pixFee: 1.99 }).perOrder[0].fee).toBe(1.99)
  })

  it('débito é sempre à vista', () => {
    const c = paymentCharges('DEBIT_CARD', 5, [100], terms)
    expect(c.installments).toBe(1)
    expect(c.perOrder[0].interest).toBe(0)
  })

  it('carrinho com várias lojas: juros e taxa rateados, somas fecham', () => {
    const c = paymentCharges('CREDIT_CARD', 8, [60, 40], terms)
    const juros = c.perOrder.reduce((s, x) => s + x.interest, 0)
    const totais = c.perOrder.reduce((s, x) => s + x.total, 0)
    expect(Math.round(totais * 100) / 100).toBe(c.chargedTotal)
    expect(Math.round(juros * 100) / 100).toBe(Math.round((c.chargedTotal - 100) * 100) / 100)
    expect(c.perOrder[0].fee).toBeGreaterThan(c.perOrder[1].fee)
  })

  it('allocate fecha o centavo no maior peso', () => {
    expect(allocate(10, [1, 1, 1])).toEqual([3.34, 3.33, 3.33])
    expect(allocate(10, [1, 3, 1])).toEqual([2, 6, 2])
  })

  it('allocate nunca dá parte negativa (pedido de R$ 0 no carrinho)', () => {
    const parts = allocate(1.01, [1, 1, 0])
    expect(parts.every((x) => x >= 0)).toBe(true)
    expect(parts[2]).toBe(0)
    expect(Math.round(parts.reduce((s, x) => s + x, 0) * 100) / 100).toBe(1.01)
  })

  it('frete do motoboy: a taxa sobre ele é da plataforma, não da loja', () => {
    // produtos R$ 20 + frete do app R$ 12 = R$ 32 à vista → taxa total 2,99% + 0,49 = 1,45
    const c = paymentCharges('CREDIT_CARD', 1, [32], terms, { storeBases: [20] })
    expect(cardFeeFor(32, 1, terms)).toBe(1.45)
    expect(c.perOrder[0].fee).toBe(0.91) // 1,45 × 20/32
  })

  it('entrega pela loja: o frete é dela, a taxa incide sobre tudo', () => {
    const c = paymentCharges('CREDIT_CARD', 1, [32], terms, { storeBases: [32] })
    expect(c.perOrder[0].fee).toBe(1.45)
  })

  it('split do Mercado Pago: não desconta taxa (o MP já cobra da loja)', () => {
    expect(paymentCharges('CREDIT_CARD', 3, [100], terms, { noFees: true }).perOrder[0].fee).toBe(0)
    expect(paymentCharges('PIX', undefined, [100], { ...terms, pixFee: 2 }, { noFees: true }).perOrder[0].fee).toBe(0)
  })

  it('base da loja nunca passa do total nem fica negativa', () => {
    const c = paymentCharges('CREDIT_CARD', 1, [10, 10], terms, { storeBases: [50, -5] })
    expect(c.perOrder[1].fee).toBe(0)
    expect(c.perOrder[0].fee).toBeLessThanOrEqual(cardFeeFor(20, 1, terms))
  })
})
