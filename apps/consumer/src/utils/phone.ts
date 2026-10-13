/**
 * Máscara de telefone BR: (69) 99999-9999 (cap em 11 dígitos: DDD + 9).
 * Use no onChangeText; no submit, envie só dígitos com onlyDigits().
 */
export function formatPhoneBR(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.replace(/(\d{0,2})/, '($1')
  if (d.length <= 6) return d.replace(/(\d{2})(\d{0,4})/, '($1) $2')
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3')
}

export function onlyDigits(v: string): string {
  return (v ?? '').replace(/\D/g, '')
}
