/** Distância em km entre dois pontos (fórmula de haversine). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

/** Lê latitude/longitude; devolve undefined se faltar ou for inválida. */
export function coordsDaQuery(lat?: string | number, lng?: string | number): { lat: number; lng: number } | undefined {
  const la = typeof lat === 'number' ? lat : parseFloat(lat ?? '')
  const lo = typeof lng === 'number' ? lng : parseFloat(lng ?? '')
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return undefined
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return undefined
  return { lat: la, lng: lo }
}
