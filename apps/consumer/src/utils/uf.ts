/** Siglas de UF e conversão do nome que o GPS devolve ("Rondônia") para a sigla. */

export const STATES = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

// Nome do estado (sem acento, minúsculo) → sigla UF. O reverse geocode do Android
// devolve o nome por extenso ("Rondônia"), então mapeamos pra sigla do nosso seletor.
const STATE_NAME_TO_UF: Record<string, string> = {
  'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA',
  'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO',
  'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
  'para': 'PA', 'paraiba': 'PB', 'parana': 'PR', 'pernambuco': 'PE', 'piaui': 'PI',
  'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
  'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
  'sergipe': 'SE', 'tocantins': 'TO',
}

// Hermes não garante String.normalize — removemos acentos na mão.
function stripAccents(s: string): string {
  return s
    .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
    .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c')
}

export function regionToUf(region?: string | null): string | undefined {
  if (!region) return undefined
  const r = region.trim()
  if (r.length === 2 && STATES.includes(r.toUpperCase())) return r.toUpperCase()
  return STATE_NAME_TO_UF[stripAccents(r.toLowerCase())]
}
