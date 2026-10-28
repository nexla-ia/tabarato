/** Valida CNPJ pelos dígitos verificadores. Aceita com ou sem máscara. */
export function isValidCnpj(cnpj: string): boolean {
  const d = (cnpj ?? '').replace(/\D/g, '')
  if (d.length !== 14) return false
  if (/^(\d)\1{13}$/.test(d)) return false
  const digit = (len: number): number => {
    const pesos = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < len; i++) sum += parseInt(d[i], 10) * pesos[i]
    const mod = sum % 11
    return mod < 2 ? 0 : 11 - mod
  }
  return digit(12) === parseInt(d[12], 10) && digit(13) === parseInt(d[13], 10)
}
