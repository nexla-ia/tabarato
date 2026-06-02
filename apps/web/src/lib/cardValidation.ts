export function luhnCheck(num: string): boolean {
  const digits = num.replace(/\D/g, '')
  if (digits.length < 13) return false
  let sum = 0
  let isEven = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10)
    if (isEven) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    isEven = !isEven
  }
  return sum % 10 === 0
}

export function detectBrand(num: string): 'amex' | 'other' {
  const d = num.replace(/\D/g, '')
  return /^3[47]/.test(d) ? 'amex' : 'other'
}

export function validateExpiry(expiry: string): boolean {
  const parts = expiry.replace(/\D/g, '').padEnd(4, '0')
  const month = parseInt(parts.slice(0, 2), 10)
  const year  = parseInt(`20${parts.slice(2, 4)}`, 10)
  if (month < 1 || month > 12) return false
  const now = new Date()
  const expDate = new Date(year, month - 1, 1)
  return expDate >= new Date(now.getFullYear(), now.getMonth(), 1)
}

export function validateCpf(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i)
  let check = (sum * 10) % 11
  if (check === 10 || check === 11) check = 0
  if (check !== parseInt(d[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i)
  check = (sum * 10) % 11
  if (check === 10 || check === 11) check = 0
  return check === parseInt(d[10])
}

export function validateCvv(cvv: string, brand: 'amex' | 'other'): boolean {
  const d = cvv.replace(/\D/g, '')
  return brand === 'amex' ? d.length === 4 : d.length === 3
}

export interface CardValidationErrors {
  cardNumber?: string
  expiry?: string
  cvv?: string
  cpf?: string
}

export function validateCardForm(fields: {
  cardNumber: string
  expiry: string
  cvv: string
  cpf: string
}): CardValidationErrors {
  const errors: CardValidationErrors = {}
  const brand = detectBrand(fields.cardNumber)

  if (!luhnCheck(fields.cardNumber)) {
    errors.cardNumber = 'Número de cartão inválido'
  }
  if (!validateExpiry(fields.expiry)) {
    errors.expiry = 'Data de validade inválida ou expirada'
  }
  if (!validateCvv(fields.cvv, brand)) {
    errors.cvv = brand === 'amex' ? 'CVV Amex deve ter 4 dígitos' : 'CVV deve ter 3 dígitos'
  }
  if (fields.cpf && !validateCpf(fields.cpf)) {
    errors.cpf = 'CPF inválido'
  }
  return errors
}
