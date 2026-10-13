import { createContext, useContext, useState, ReactNode } from 'react'
import type { AuthUser } from '../types'

interface AuthContextType {
  user: AuthUser | null
  token: string | null
  login: (token: string, user: AuthUser, refreshToken?: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('admin_token'))
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('admin_user')
    return stored ? (JSON.parse(stored) as AuthUser) : null
  })

  const login = (newToken: string, newUser: AuthUser, refreshToken?: string) => {
    localStorage.setItem('admin_token', newToken)
    // Sem refresh a sessão morre em 7 dias e o painel inteiro para; com ele o
    // api.ts renova sozinho e a pessoa só volta ao login depois de 30 dias.
    if (refreshToken) localStorage.setItem('admin_refresh', refreshToken)
    localStorage.setItem('admin_user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
  }

  const logout = () => {
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_refresh')
    localStorage.removeItem('admin_user')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
