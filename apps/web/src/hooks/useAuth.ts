'use client'
import { useEffect, useState } from 'react'
import { setToken, clearToken } from '@/lib/api'

export interface AuthUser { id: string; name: string; email: string; role: string }

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('tb_user')
      const token = localStorage.getItem('tb_token')
      if (raw && token) {
        setUser(JSON.parse(raw))
        setToken(token)
      }
    } catch {}
    setReady(true)
  }, [])

  function logout() {
    clearToken()
    localStorage.removeItem('tb_token')
    localStorage.removeItem('tb_user')
    setUser(null)
  }

  function login(token: string, userData: AuthUser) {
    setToken(token)
    localStorage.setItem('tb_token', token)
    localStorage.setItem('tb_user', JSON.stringify(userData))
    setUser(userData)
  }

  return { user, ready, login, logout }
}
