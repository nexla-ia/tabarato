import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { CartItem, Product, ProductVariation } from '../types'
import { promoDiscountFor } from '../utils/promo'

export interface CartGroup {
  storeId: string
  storeName: string
  items: CartItem[]
}

interface CartState {
  items: CartItem[]
  // Cupom por loja (storeId → código). Multi-loja: cada loja pode ter seu cupom.
  coupons: Record<string, string>
  addItem: (storeId: string, storeName: string, product: Product, variation?: ProductVariation, quantity?: number, notes?: string) => void
  removeItem: (productId: string, variationId?: string) => void
  updateQuantity: (productId: string, variationId: string | undefined, quantity: number) => void
  clearCart: () => void
  clearStore: (storeId: string) => void
  setCoupon: (storeId: string, code: string) => void
  removeCoupon: (storeId: string) => void
  groups: () => CartGroup[]
  storeSubtotal: (storeId: string) => number
  storePromoDiscount: (storeId: string) => number
  total: () => number
  itemCount: () => number
  storeCount: () => number
  // Atualiza os snapshots dos produtos com dados frescos do servidor; retorna
  // quantos itens tiveram o PREÇO alterado (pra avisar o cliente).
  syncProducts: (fresh: Product[]) => number
}

function itemPrice(i: CartItem): number {
  return Number(i.variation?.price ?? i.product.basePrice ?? 0)
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      coupons: {},

      // Multi-loja: adicionar item de outra loja NÃO zera o carrinho — só agrupa.
      addItem: (storeId, storeName, product, variation, quantity = 1, notes) => {
        const { items } = get()
        const exists = items.find(
          (i) => i.product.id === product.id && i.variation?.id === variation?.id,
        )
        if (exists) {
          set({
            items: items.map((i) =>
              i.product.id === product.id && i.variation?.id === variation?.id
                ? { ...i, quantity: i.quantity + quantity }
                : i,
            ),
          })
        } else {
          set({ items: [...items, { product, variation, quantity, notes, storeId, storeName }] })
        }
      },

      removeItem: (productId, variationId) => {
        const items = get().items.filter(
          (i) => !(i.product.id === productId && i.variation?.id === variationId),
        )
        // Se a loja ficou sem itens, remove o cupom dela também.
        const stillHasStore = (sid: string) => items.some((i) => i.storeId === sid)
        const removed = get().items.find((i) => i.product.id === productId && i.variation?.id === variationId)
        const coupons = { ...get().coupons }
        if (removed && !stillHasStore(removed.storeId)) delete coupons[removed.storeId]
        set({ items, coupons })
      },

      updateQuantity: (productId, variationId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId, variationId)
          return
        }
        set({
          items: get().items.map((i) =>
            i.product.id === productId && i.variation?.id === variationId
              ? { ...i, quantity }
              : i,
          ),
        })
      },

      clearCart: () => set({ items: [], coupons: {} }),

      clearStore: (storeId) => {
        const coupons = { ...get().coupons }
        delete coupons[storeId]
        set({ items: get().items.filter((i) => i.storeId !== storeId), coupons })
      },

      setCoupon: (storeId, code) => set({ coupons: { ...get().coupons, [storeId]: code } }),
      removeCoupon: (storeId) => {
        const coupons = { ...get().coupons }
        delete coupons[storeId]
        set({ coupons })
      },

      // Agrupa os itens por loja, preservando a ordem de inserção das lojas.
      groups: () => {
        const map = new Map<string, CartGroup>()
        for (const i of get().items) {
          const g = map.get(i.storeId)
          if (g) g.items.push(i)
          else map.set(i.storeId, { storeId: i.storeId, storeName: i.storeName, items: [i] })
        }
        return Array.from(map.values())
      },

      storeSubtotal: (storeId) =>
        get().items
          .filter((i) => i.storeId === storeId)
          .reduce((sum, i) => sum + itemPrice(i) * i.quantity, 0),

      // Soma o desconto "Leve X Pague Y" dos itens da loja (mesma regra do backend).
      storePromoDiscount: (storeId) =>
        Math.round(
          get().items
            .filter((i) => i.storeId === storeId)
            .reduce((sum, i) => sum + promoDiscountFor(i.quantity, itemPrice(i), i.product.promoBuyQty, i.product.promoPayQty), 0) * 100,
        ) / 100,

      total: () => get().items.reduce((sum, i) => sum + itemPrice(i) * i.quantity, 0),

      itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      storeCount: () => new Set(get().items.map((i) => i.storeId)).size,

      syncProducts: (fresh) => {
        const byId = new Map(fresh.map((p) => [p.id, p]))
        let priceChanged = 0
        let anyUpdate = false
        const items = get().items.map((i) => {
          const fp = byId.get(i.product.id)
          if (!fp) return i
          const newVar = i.variation ? fp.variations?.find((v) => v.id === i.variation!.id) : undefined
          const oldPrice = Number(i.variation?.price ?? i.product.basePrice ?? 0)
          const newPrice = Number(newVar?.price ?? fp.basePrice ?? 0)
          if (newPrice !== oldPrice) priceChanged++
          anyUpdate = true
          return { ...i, product: fp, variation: newVar ?? i.variation }
        })
        if (anyUpdate) set({ items })
        return priceChanged
      },
    }),
    {
      name: 'tabarato-cart',
      storage: createJSONStorage(() => AsyncStorage),
      // Persiste itens + cupons por loja.
      partialize: (state) => ({ items: state.items, coupons: state.coupons }),
    },
  ),
)
