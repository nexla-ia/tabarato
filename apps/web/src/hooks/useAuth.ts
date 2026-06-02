'use client'
import { useEffect, useState } from 'react'
import { setToken, clearToken } from '@/lib/api'
import { useCartStore } from '@/stores/cart'

export interface AuthUser { id: string; name: string; email: string; role: string }

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [ready, setReady] = useState(false)
  const clearCart = useCartStore((s) => s.clear)

  useEffect(() => {
    try {
      const raw   = localStorage.getItem('tb_user')
      const token = localStorage.getItem('tb_token')
      if (raw && token) {
        const parsed: AuthUser = JSON.parse(raw)
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
    setUser(null)
  }

  function login(token: string, userData: AuthUser) {
    // Clear cart from any previous user before logging in
    const prevRaw = localStorage.getItem('tb_user')
    if (prevRaw) {
      try {
        const prev: AuthUser = JSON.parse(prevRaw)
        if (prev.id !== userData.id) clearCart()
      } catch {}
    }

    setToken(token)
    localStorage.setItem('tb_token', token)
    localStorage.setItem('tb_user', JSON.stringify(userData))
    setUser(userData)
  }

  return { user, ready, login, logout }
}
