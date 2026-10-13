import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api } from '../api/client'

interface FavoritesState {
  ids: Set<string>
  toggle: (storeId: string) => Promise<void>
  load: () => Promise<void>
  isFavorite: (storeId: string) => boolean
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      ids: new Set<string>(),

      isFavorite: (storeId) => get().ids.has(storeId),

      load: async () => {
        try {
          const { data } = await api.get<string[]>('/users/me/favorites/ids')
          set({ ids: new Set(data) })
        } catch {}
      },

      toggle: async (storeId) => {
        const isFav = get().ids.has(storeId)
        // Optimistic update
        set(state => {
          const next = new Set(state.ids)
          isFav ? next.delete(storeId) : next.add(storeId)
          return { ids: next }
        })
        try {
          if (isFav) {
            await api.delete(`/users/me/favorites/${storeId}`)
          } else {
            await api.post(`/users/me/favorites/${storeId}`)
          }
        } catch {
          // Revert on error
          set(state => {
            const next = new Set(state.ids)
            isFav ? next.add(storeId) : next.delete(storeId)
            return { ids: next }
          })
        }
      },
    }),
    {
      name: 'tabarato-favorites',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ ids: [...state.ids] }),
      merge: (persisted: any, current) => ({
        ...current,
        ids: new Set(persisted?.ids ?? []),
      }),
    },
  ),
)
