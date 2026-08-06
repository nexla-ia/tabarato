export interface CnpjLookupResult {
  name: string
  address: string
}

/** Busca dados públicos do CNPJ na Receita via BrasilAPI (grátis, sem chave). */
export async function lookupCnpj(digits: string): Promise<CnpjLookupResult | null> {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
    if (!res.ok) return null
    const data = await res.json()

    const name = data.nome_fantasia?.trim() || data.razao_social?.trim() || ''

    const street = [data.logradouro, data.numero].filter(Boolean).join(', ')
    const line1 = [street, data.bairro].filter(Boolean).join(', ')
    const line2 = [data.municipio, data.uf].filter(Boolean).join(' - ')
    const address = [line1, line2].filter(Boolean).join(' — ')

    if (!name && !address) return null
    return { name, address }
  } catch {
    return null
  }
}
