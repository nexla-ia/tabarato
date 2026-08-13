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
