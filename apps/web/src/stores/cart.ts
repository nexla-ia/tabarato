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

export interface AppliedCoupon {
  code: string
  description?: string | null
  discountPercent?: number | string | null
  discountFixed?: number | string | null
  discount: number
  freeShipping: boolean
}

export interface StoreCart {
  storeId: string
  storeName: string
  items: CartItem[]
  coupon: AppliedCoupon | null
}

interface CartState {
  stores: StoreCart[]
  userId: string | null
  addItem: (storeId: string, storeName: string, item: CartItem, userId?: string) => void
  removeItem: (storeId: string, productId: string, variationId?: string) => void
  updateQty: (storeId: string, productId: string, variationId: string | undefined, qty: number) => void
  clearStore: (storeId: string) => void
  clear: () => void
  itemCount: () => number
  total: () => number
  storeTotal: (storeId: string) => number
  setCoupon: (storeId: string, coupon: AppliedCoupon | null) => void
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      stores: [],
      userId: null,

      // Carrinho multi-loja: cada loja tem seu próprio grupo de itens e cupom.
      // Adicionar item de uma loja nova cria um novo grupo — não mexe nos outros.
      addItem(storeId, storeName, item, userId) {
        const state = get()
        const uid = userId ?? state.userId ?? null
        const idx = state.stores.findIndex((s) => s.storeId === storeId)

        if (idx === -1) {
          set({ userId: uid, stores: [...state.stores, { storeId, storeName, items: [item], coupon: null }] })
          return
        }

        const store = state.stores[idx]
        const existingIdx = store.items.findIndex(
          (i) => i.productId === item.productId && i.variationId === item.variationId,
        )
        const newItems = existingIdx === -1
          ? [...store.items, item]
          : store.items.map((i, ix) => (ix === existingIdx ? { ...i, quantity: i.quantity + item.quantity } : i))

        set({
          userId: uid,
          stores: state.stores.map((s, i) => (i === idx ? { ...s, items: newItems } : s)),
        })
      },

      // Loja fica sem itens → some do carrinho (junto com o cupom dela).
      removeItem(storeId, productId, variationId) {
        const stores = get().stores
          .map((s) => (s.storeId === storeId
            ? { ...s, items: s.items.filter((i) => !(i.productId === productId && i.variationId === variationId)) }
            : s))
          .filter((s) => s.items.length > 0)
        set({ stores })
      },

      updateQty(storeId, productId, variationId, qty) {
        if (qty <= 0) {
          get().removeItem(storeId, productId, variationId)
          return
        }
        set({
          stores: get().stores.map((s) => (s.storeId === storeId
            ? { ...s, items: s.items.map((i) => (i.productId === productId && i.variationId === variationId ? { ...i, quantity: qty } : i)) }
            : s)),
        })
      },

      clearStore(storeId) {
        set({ stores: get().stores.filter((s) => s.storeId !== storeId) })
      },

      clear: () => set({ stores: [], userId: null }),

      itemCount: () => get().stores.reduce((acc, s) => acc + s.items.reduce((a, i) => a + i.quantity, 0), 0),

      total: () => get().stores.reduce((acc, s) => acc + s.items.reduce((a, i) => a + i.price * i.quantity, 0), 0),

      storeTotal: (storeId) => {
        const s = get().stores.find((s) => s.storeId === storeId)
        return s ? s.items.reduce((a, i) => a + i.price * i.quantity, 0) : 0
      },

      setCoupon: (storeId, coupon) => set({
        stores: get().stores.map((s) => (s.storeId === storeId ? { ...s, coupon } : s)),
      }),
    }),
    {
      name: 'tb-cart',
      version: 1,
      // Migra o formato antigo (1 loja só: storeId/storeName/items/coupon no topo)
      // para o novo formato multi-loja (stores: StoreCart[]).
      migrate: (persisted: any) => {
        if (persisted && Array.isArray(persisted.stores)) return persisted
        if (persisted && persisted.storeId && Array.isArray(persisted.items) && persisted.items.length > 0) {
          return {
            userId: persisted.userId ?? null,
            stores: [{
              storeId: persisted.storeId,
              storeName: persisted.storeName ?? '',
              items: persisted.items,
              coupon: persisted.coupon ?? null,
            }],
          }
        }
        return { stores: [], userId: null }
      },
    },
  ),
)
