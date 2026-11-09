/**
 * Parcelamento e taxa de pagamento — cálculo único, usado no pedido (fonte da
 * verdade) e espelhado no app/site só para exibir.
 *
 * Regras combinadas com o cliente (09/11/2026):
 *  - A TAXA do meio de pagamento é da LOJA: sai do repasse dela, não da comissão.
 *  - O cliente parcela até `maxInstallments`; até `freeInstallments` é sem juros,
 *    acima disso paga juros (Tabela Price, `interestMonthlyPct` ao mês). O juros vai
 *    para a loja, que é quem paga a taxa maior do parcelado.
 */

export interface PaymentTerms {
  maxInstallments: number
  freeInstallments: number
  interestMonthlyPct: number
  cardFeePct1x: number
  cardFeePct2to6: number
  cardFeePct7to12: number
  cardFeeFixed: number
  pixFee: number
}

/** Valor mínimo de cada parcela (o Asaas não cobra menos que isso). */
export const MIN_INSTALLMENT_VALUE = 5

const round2 = (v: number) => Math.round(v * 100) / 100

/** Quantas parcelas cabem neste total (respeita o máximo e a parcela mínima). */
export function maxInstallmentsFor(total: number, terms: Pick<PaymentTerms, 'maxInstallments'>): number {
  return Math.max(1, Math.min(Math.floor(terms.maxInstallments), Math.floor(total / MIN_INSTALLMENT_VALUE)))
}

export interface InstallmentPlan {
  installments: number
  interest: number
  chargedTotal: number
  installmentValue: number
  interestFree: boolean
}

/** Total cobrado do cliente em N parcelas (com juros só acima das sem juros). */
export function installmentPlan(total: number, n: number, terms: Pick<PaymentTerms, 'freeInstallments' | 'interestMonthlyPct'>): InstallmentPlan {
  const installments = Math.max(1, Math.floor(n))
  const i = terms.interestMonthlyPct / 100
  if (installments <= terms.freeInstallments || i <= 0) {
    return { installments, interest: 0, chargedTotal: round2(total), installmentValue: round2(total / installments), interestFree: true }
  }
  const pmt = (total * i) / (1 - Math.pow(1 + i, -installments))
  const installmentValue = round2(pmt)
  const chargedTotal = round2(installmentValue * installments)
  return { installments, interest: round2(chargedTotal - total), chargedTotal, installmentValue, interestFree: false }
}

/** Taxa do cartão sobre o valor cobrado (faixa pela quantidade de parcelas). */
export function cardFeeFor(chargedTotal: number, installments: number, terms: PaymentTerms): number {
  const pct = installments <= 1 ? terms.cardFeePct1x : installments <= 6 ? terms.cardFeePct2to6 : terms.cardFeePct7to12
  return round2((chargedTotal * pct) / 100 + terms.cardFeeFixed)
}

/** Divide `amount` proporcional aos pesos, em centavos; o resto vai pro último. */
export function allocate(amount: number, weights: number[]): number[] {
  if (!weights.length) return []
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0)
  let given = 0
  return weights.map((w, idx) => {
    if (idx === weights.length - 1) return round2(amount - given)
    const part = sum > 0 ? round2((amount * Math.max(0, w)) / sum) : 0
    given = round2(given + part)
    return part
  })
}

export interface PaymentCharges {
  installments: number
  chargedTotal: number
  /** Por pedido (mesma ordem dos totais recebidos). */
  perOrder: Array<{ interest: number; fee: number; total: number }>
}

/**
 * Quanto o cliente paga e quanto de taxa cada loja assume, para um pagamento que
 * cobre um ou mais pedidos (carrinho com várias lojas = 1 cobrança).
 */
export function paymentCharges(
  method: string,
  requestedInstallments: number | undefined,
  orderTotals: number[],
  terms: PaymentTerms,
): PaymentCharges {
  const grand = round2(orderTotals.reduce((s, t) => s + t, 0))
  const isCard = method === 'CREDIT_CARD' || method === 'DEBIT_CARD'

  if (!isCard) {
    const fee = method === 'PIX' ? terms.pixFee : 0
    const fees = allocate(fee, orderTotals)
    return {
      installments: 1,
      chargedTotal: grand,
      perOrder: orderTotals.map((t, i) => ({ interest: 0, fee: fees[i], total: t })),
    }
  }

  // Débito é sempre à vista.
  const n = method === 'DEBIT_CARD' ? 1 : Math.max(1, Math.floor(requestedInstallments ?? 1))
  const plan = installmentPlan(grand, n, terms)
  const interests = allocate(plan.interest, orderTotals)
  const charged = orderTotals.map((t, i) => round2(t + interests[i]))
  const fees = allocate(cardFeeFor(plan.chargedTotal, n, terms), charged)
  return {
    installments: n,
    chargedTotal: plan.chargedTotal,
    perOrder: orderTotals.map((_, i) => ({ interest: interests[i], fee: fees[i], total: charged[i] })),
  }
}
