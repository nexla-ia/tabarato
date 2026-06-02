import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartItem {
  productId: string
  variationId?: string
  name: string
  price: number
  quantity: number
  imageUrl?: string
  variationName?: string
}

interface CartState {
  storeId: string | null
  storeName: string | null
  items: CartItem[]
  userId: string | null
  addItem: (storeId: string, storeName: string, item: CartItem, userId?: string) => void
  removeItem: (productId: string, variationId?: string) => void
  updateQty: (productId: string, variationId: string | undefined, qty: number) => void
  clear: () => void
  total: () => number
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      storeId: null,
      storeName: null,
      items: [],
      userId: null,

      addItem(storeId, storeName, item, userId) {
        const state = get()
        // Different store — ask user (handled in UI), clear and add
        if (state.storeId && state.storeId !== storeId) {
          set({ storeId, storeName, userId: userId ?? null, items: [{ ...item, quantity: item.quantity }] })
          return
        }
        const existing = state.items.find(
          i => i.productId === item.productId && i.variationId === item.variationId,
        )
        if (existing) {
          set({
            items: state.items.map(i =>
              i.productId === item.productId && i.variationId === item.variationId
                ? { ...i, quantity: i.quantity + item.quantity }
                : i,
            ),
          })
        } else {
          set({ storeId, storeName, items: [...state.items, item] })
        }
      },

      removeItem(productId, variationId) {
        const items = get().items.filter(
          i => !(i.productId === productId && i.variationId === variationId),
        )
        set({ items, ...(items.length === 0 ? { storeId: null, storeName: null } : {}) })
      },

      updateQty(productId, variationId, qty) {
        if (qty <= 0) {
          get().removeItem(productId, variationId)
          return
        }
        set({
          items: get().items.map(i =>
            i.productId === productId && i.variationId === variationId ? { ...i, quantity: qty } : i,
          ),
        })
      },

      clear: () => set({ storeId: null, storeName: null, items: [], userId: null }),

      total: () => get().items.reduce((acc, i) => acc + i.price * i.quantity, 0),
    }),
    { name: 'tb-cart' },
  ),
)
