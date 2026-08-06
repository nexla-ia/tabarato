// Ionicon name (vindo do backend) → emoji apetitoso pra web
const ICONS: Record<string, string> = {
  restaurant: '🍽️', 'restaurant-outline': '🍱', 'fast-food': '🍔', pizza: '🍕',
  cafe: '☕', wine: '🍷', beer: '🍺', 'ice-cream': '🍦', nutrition: '🥗',
  fish: '🐟', basket: '🛒', cart: '🛒', bag: '🛍️', medkit: '💊', medical: '💊',
  pharmacy: '💊', flask: '🧪', flower: '💐', gift: '🎁', paw: '🐾', shirt: '👕',
  footsteps: '👟', cut: '✂️', hardware: '🔧', construct: '🔨', book: '📚',
  storefront: '🏪', market: '🛒', bakery: '🥐', bread: '🥖', leaf: '🍃',
  flame: '🔥', heart: '❤️', cube: '📦', home: '🏠', car: '🚗',
  'phone-portrait': '📱', laptop: '💻', football: '⚽', glasses: '👓',
}

export function emojiFor(icon?: string | null): string {
  if (!icon) return '🏪'
  return ICONS[icon] ?? '🏪'
}

// "Outros" é o catch-all — sempre por último em qualquer lista de categorias.
export function sortCategoriesOutrosLast<T extends { name: string }>(categories: T[]): T[] {
  return [...categories].sort((a, b) => {
    const aOutros = a.name.trim().toLowerCase() === 'outros'
    const bOutros = b.name.trim().toLowerCase() === 'outros'
    if (aOutros === bOutros) return 0
    return aOutros ? 1 : -1
  })
}
