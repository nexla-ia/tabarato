'use client'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { setToken, clearToken } from '@/lib/api'
import { useCartStore } from '@/stores/cart'

export interface AuthUser { id: string; name: string; email: string; role: string }

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [ready, setReady] = useState(false)
  const clearCart = useCartStore((s) => s.clear)
  const queryClient = useQueryClient()

  useEffect(() => {
    try {
      const raw   = localStorage.getItem('tb_user')
      const token = localStorage.getItem('tb_token')
      if (raw && token) {
        const parsed: AuthUser = JSON.parse(raw)
        // Entregador não tem acesso ao site (ver login). Sessões criadas antes
        // dessa regra continuariam válidas pelo localStorage — derruba aqui.
        if (parsed.role === 'COURIER') {
          clearToken()
          localStorage.removeItem('tb_token')
          localStorage.removeItem('tb_user')
          setReady(true)
          return
        }
        setUser(parsed)
        setToken(token)

        // Invalidate cart if it belongs to a different user
        try {
          const cartRaw = localStorage.getItem('tb-cart')
          if (cartRaw) {
            const cart = JSON.parse(cartRaw)
            if (cart?.state?.userId && cart.state.userId !== parsed.id) {
              clearCart()
            }
          }
        } catch {}
      }
    } catch {}
    setReady(true)
  }, [])

  function logout() {
    clearToken()
    localStorage.removeItem('tb_token')
    localStorage.removeItem('tb_user')
    clearCart()
    // Limpa o cache do React Query para não vazar dados (pedidos/PII) do usuário
    // anterior para o próximo login no mesmo navegador.
    queryClient.clear()
    setUser(null)
  }

  function login(token: string, userData: AuthUser) {
    // Clear cart from any previous user before logging in
    const prevRaw = localStorage.getItem('tb_user')
    if (prevRaw) {
      try {
        const prev: AuthUser = JSON.parse(prevRaw)
        if (prev.id !== userData.id) { clearCart(); queryClient.clear() }
      } catch {}
    }

    setToken(token)
    localStorage.setItem('tb_token', token)
    localStorage.setItem('tb_user', JSON.stringify(userData))
    setUser(userData)
  }

  return { user, ready, login, logout }
}
