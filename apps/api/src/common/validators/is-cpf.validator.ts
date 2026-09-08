import { registerDecorator, ValidationOptions } from 'class-validator'

/** Valida CPF pelos dígitos verificadores (não só a forma). Aceita com ou sem máscara. */
export function isValidCpf(cpf: string): boolean {
  const d = (cpf ?? '').replace(/\D/g, '')
  if (d.length !== 11) return false
  if (/^(\d)\1{10}$/.test(d)) return false // rejeita 000... 111... etc.
  const digit = (len: number): number => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += parseInt(d[i], 10) * (len + 1 - i)
    const mod = (sum * 10) % 11
    return mod === 10 ? 0 : mod
  }
  return digit(9) === parseInt(d[9], 10) && digit(10) === parseInt(d[10], 10)
}

export function IsCPF(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCPF',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: any) => typeof value === 'string' && isValidCpf(value),
        defaultMessage: () => 'CPF inválido.',
      },
    })
  }
}
