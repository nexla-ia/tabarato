// Espelho de apps/api/src/payments/card-plan.ts — só para EXIBIR. O valor cobrado
// de verdade é calculado na API com a mesma fórmula.

export interface CardTerms {
  maxInstallments: number
  freeInstallments: number
  interestMonthlyPct: number
  minInstallmentValue: number
}

export const DEFAULT_CARD_TERMS: CardTerms = {
  maxInstallments: 10,
  freeInstallments: 6,
  interestMonthlyPct: 2.99,
  minInstallmentValue: 5,
}

const round2 = (v: number) => Math.round(v * 100) / 100

export function maxInstallmentsFor(total: number, t: CardTerms): number {
  return Math.max(1, Math.min(Math.floor(t.maxInstallments), Math.floor(total / t.minInstallmentValue)))
}

export function installmentPlan(total: number, n: number, t: CardTerms) {
  const i = t.interestMonthlyPct / 100
  if (n <= t.freeInstallments || i <= 0) {
    return { interest: 0, chargedTotal: round2(total), installmentValue: round2(total / n), interestFree: true }
  }
  const installmentValue = round2((total * i) / (1 - Math.pow(1 + i, -n)))
  const chargedTotal = round2(installmentValue * n)
  return { interest: round2(chargedTotal - total), chargedTotal, installmentValue, interestFree: false }
}
