import { isValidCpf } from './is-cpf.validator'

describe('isValidCpf', () => {
  it('aceita CPF válido (com máscara)', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
  })
  it('aceita CPF válido (sem máscara)', () => {
    expect(isValidCpf('52998224725')).toBe(true)
  })
  it('rejeita dígito verificador errado', () => {
    expect(isValidCpf('529.982.247-24')).toBe(false)
  })
  it('rejeita todos os dígitos iguais', () => {
    expect(isValidCpf('111.111.111-11')).toBe(false)
    expect(isValidCpf('00000000000')).toBe(false)
  })
  it('rejeita tamanho inválido / vazio', () => {
    expect(isValidCpf('123')).toBe(false)
    expect(isValidCpf('')).toBe(false)
  })
})
