'use client'
import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import styles from './page.module.css'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      login(data.accessToken, data.user)
      // Se veio de uma página protegida (ex.: checkout), volta pra lá.
      const redirect = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('redirect')
        : null
      // startsWith('/') sozinho deixaria passar "//evil.com" (URL protocol-relative);
      // exige uma barra e não duas, pra garantir que é sempre um caminho interno.
      if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
        router.push(redirect)
      } else {
        // Route by role: store owners land on the lojista panel
        router.push(data.user?.role === 'STORE_OWNER' ? '/lojista' : '/')
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Credenciais inválidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Link href="/" className={styles.backLink}><ArrowLeft size={16} /> Voltar ao início</Link>
        <div className={styles.logoWrap}>
          <Link href="/" className={styles.logoLink}>
            <Image src="/logo.png" alt="Tá Barato" width={120} height={120} style={{ objectFit: 'contain' }} priority />
          </Link>
        </div>
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
          <div className={styles.passField}>
            <input
              className={styles.input}
              type={showPass ? 'text' : 'password'} required
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button type="button" className={styles.eye} onClick={() => setShowPass(v => !v)}>
              {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className={styles.footer}>
          Não tem conta?{' '}
          <Link href="/register" className={styles.link}>Criar conta grátis</Link>
        </p>
        <p className={styles.footer} style={{ marginTop: 4 }}>
          É lojista?{' '}
          <Link href="/cadastro-loja" className={styles.link}>Cadastre sua loja</Link>
        </p>
      </div>
    </div>
  )
}
