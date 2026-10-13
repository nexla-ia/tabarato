import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { User } from '../types'
import { useCartStore } from './cart.store'
import { disconnectSocket } from '../socket'
import { queryClient } from '../queryClient'

interface AuthState {
  user: User | null
  accessToken: string | null
  isLoading: boolean
  setAuth: (user: User, accessToken: string, refreshToken: string) => Promise<void>
  setUser: (user: User) => void
  clearAuth: () => Promise<void>
  loadFromStorage: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isLoading: true,

  setUser: (user) => set({ user }),

  setAuth: async (user, accessToken, refreshToken) => {
    await SecureStore.setItemAsync('access_token', accessToken)
    await SecureStore.setItemAsync('refresh_token', refreshToken)
    set({ user, accessToken })
  },

  clearAuth: async () => {
    await SecureStore.deleteItemAsync('access_token')
    await SecureStore.deleteItemAsync('refresh_token')
    // Limpa estado do usuário anterior: carrinho, socket autenticado e cache de
    // queries (pedidos/PII) — evita vazamento para o próximo login no aparelho.
    try { useCartStore.getState().clearCart() } catch {}
    try { disconnectSocket() } catch {}
    try { queryClient.clear() } catch {}
    set({ user: null, accessToken: null })
  },

  loadFromStorage: async () => {
    try {
      const token = await SecureStore.getItemAsync('access_token')
      if (token) {
        const { api } = await import('../api/client')
        const { data } = await api.get('/users/me')
        set({ user: data, accessToken: token, isLoading: false })
      } else {
        set({ isLoading: false })
      }
    } catch {
      await SecureStore.deleteItemAsync('access_token')
      set({ isLoading: false })
    }
  },
}))
