'use client'
import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api, setToken } from '@/lib/api'
import styles from './page.module.css'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      setToken(data.accessToken)
      localStorage.setItem('tb_user', JSON.stringify(data.user))
      router.push('/')
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Credenciais inválidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>🛒 Tá Barato</div>
        <h1 className={styles.title}>Entrar na conta</h1>
        <p className={styles.sub}>Acesse sua conta para fazer pedidos</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>E-mail</label>
          <input
            className={styles.input}
            type="email" required
            value={email} onChange={e => setEmail(e.target.value)}
            placeholder="seu@email.com"
          />

          <label className={styles.label}>Senha</label>
          <input
            className={styles.input}
            type="password" required
            value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          {error && <div className={styles.error}>{error}</div>}

          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className={styles.footer}>
          Não tem conta?{' '}
          <Link href="/register" className={styles.link}>Criar conta grátis</Link>
        </p>
      </div>
    </div>
  )
}
