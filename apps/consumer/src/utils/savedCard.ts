import * as SecureStore from 'expo-secure-store'

const KEY = 'saved_card_meta'

export interface SavedCardMeta {
  holderName: string
  last4: string
  expiryMonth: string
  expiryYear: string
  brand: 'visa' | 'mastercard' | 'amex' | 'other'
}

function detectBrand(cardNumber: string): SavedCardMeta['brand'] {
  const n = cardNumber.replace(/\s/g, '')
  if (/^4/.test(n)) return 'visa'
  if (/^5[1-5]/.test(n)) return 'mastercard'
  if (/^3[47]/.test(n)) return 'amex'
  return 'other'
}

const BRAND_ICON: Record<SavedCardMeta['brand'], string> = {
  visa: '💳 Visa',
  mastercard: '💳 Mastercard',
  amex: '💳 Amex',
  other: '💳 Cartão',
}

export function cardLabel(meta: SavedCardMeta) {
  return `${BRAND_ICON[meta.brand]} ••••${meta.last4} ${meta.expiryMonth}/${meta.expiryYear}`
}

export async function saveCardMeta(cardNumber: string, holderName: string, expiryMonth: string, expiryYear: string) {
  const last4 = cardNumber.replace(/\s/g, '').slice(-4)
  const meta: SavedCardMeta = {
    holderName,
    last4,
    expiryMonth,
    expiryYear,
    brand: detectBrand(cardNumber),
  }
  await SecureStore.setItemAsync(KEY, JSON.stringify(meta))
  return meta
}

export async function loadCardMeta(): Promise<SavedCardMeta | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function clearCardMeta() {
  await SecureStore.deleteItemAsync(KEY)
}
