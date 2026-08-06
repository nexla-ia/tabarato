export function onlyDigits(v: string) {
  return v.replace(/\D/g, '')
}

export function formatPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11)
  if (d.length <= 2) return d ? `(${d}` : ''
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function formatCnpj(v: string) {
  const d = onlyDigits(v).slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

function cnpjCheckDigit(digits: string, weights: number[]) {
  let sum = 0
  for (let i = 0; i < weights.length; i++) sum += parseInt(digits[i], 10) * weights[i]
  const r = sum % 11
  return r < 2 ? 0 : 11 - r
}

export function validateCnpj(v: string): boolean {
  const d = onlyDigits(v)
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const dv1 = cnpjCheckDigit(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  if (dv1 !== parseInt(d[12], 10)) return false
  const dv2 = cnpjCheckDigit(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return dv2 === parseInt(d[13], 10)
}

// Máscara de dinheiro "de trás pra frente" (centavos primeiro) — digita 1250 → 12,50.
export function formatMoneyInput(digits: string): string {
  const d = onlyDigits(digits)
  if (!d) return ''
  const padded = d.padStart(3, '0')
  const cents = padded.slice(-2)
  const reais = padded.slice(0, -2).replace(/^0+(?=\d)/, '')
  const withThousands = reais.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${withThousands},${cents}`
}

export function moneyInputToNumber(digits: string): number {
  const d = onlyDigits(digits)
  return d ? Number(d) / 100 : 0
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}
