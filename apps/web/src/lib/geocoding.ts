/** Converte um endereço em lat/lng via Nominatim (OpenStreetMap, grátis, sem chave). */
export async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
      { headers: { Accept: 'application/json' } },
    )
    if (!res.ok) return null
    const data = await res.json()
    const hit = Array.isArray(data) ? data[0] : null
    if (!hit) return null
    const lat = parseFloat(hit.lat)
    const lng = parseFloat(hit.lon)
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  } catch {
    return null
  }
}

// Nome do estado (sem acento, minúsculo) → sigla UF. O Nominatim devolve o nome por extenso.
const STATE_NAME_TO_UF: Record<string, string> = {
  'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA',
  'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO',
  'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
  'para': 'PA', 'paraiba': 'PB', 'parana': 'PR', 'pernambuco': 'PE', 'piaui': 'PI',
  'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
  'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
  'sergipe': 'SE', 'tocantins': 'TO',
}
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}
function regionToUf(region?: string | null): string | undefined {
  if (!region) return undefined
  const r = region.trim()
  if (r.length === 2) return r.toUpperCase()
  return STATE_NAME_TO_UF[stripAccents(r.toLowerCase())]
}

/** Converte lat/lng em { city, state(UF) } via Nominatim — pro fluxo de completar perfil. */
export async function reverseCity(lat: number, lng: number): Promise<{ city: string; state?: string } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`,
      { headers: { Accept: 'application/json' } },
    )
    if (!res.ok) return null
    const a = (await res.json()).address ?? {}
    const city = a.city || a.town || a.village || a.municipality
    if (!city) return null
    return { city, state: regionToUf(a.state) }
  } catch {
    return null
  }
}

/** Converte lat/lng em endereço legível via Nominatim (OpenStreetMap, grátis, sem chave). */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`,
      { headers: { Accept: 'application/json' } },
    )
    if (!res.ok) return null
    const data = await res.json()
    const a = data.address ?? {}

    const street = a.road || a.pedestrian || a.suburb
    const line1 = [street, a.house_number].filter(Boolean).join(', ')
    const neighbourhood = a.suburb || a.neighbourhood
    const withBairro = [line1, neighbourhood].filter(Boolean).join(', ')

    const city = a.city || a.town || a.village || a.municipality
    const line2 = [city, a.state].filter(Boolean).join(', ')

    const address = [withBairro, line2].filter(Boolean).join(' — ')
    return address || null
  } catch {
    return null
  }
}
