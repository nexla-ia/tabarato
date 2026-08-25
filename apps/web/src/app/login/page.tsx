'use client'
import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { GoogleSignInButton } from '@/components/GoogleSignInButton'
import styles from './page.module.css'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  // Pós-login (comum a e-mail/senha e Google): salva a sessão e redireciona.
  function handleAuthSuccess(data: any) {
    login(data.accessToken, data.user)
    // Se veio de uma página protegida (ex.: checkout), volta pra lá.
    const redirect = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('redirect')
      : null
    // startsWith('/') sozinho deixaria passar "//evil.com" (URL protocol-relative);
    // exige uma barra e não duas, pra garantir que é sempre um caminho interno.
    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
      router.push(redirect)
    } else if (data.user?.role === 'STORE_OWNER') {
      router.push('/lojista')
    } else if (data.user && !data.user.city) {
      // Cliente sem cidade (típico do login Google) → completa o perfil antes.
      router.push('/completar-perfil')
    } else {
      router.push('/')
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      handleAuthSuccess(data)
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 16px' }}>
          <span style={{ flex: 1, height: 1, background: 'var(--border, #ece7e2)' }} />
          <span style={{ fontSize: 13, color: 'var(--muted, #b0a098)' }}>ou</span>
          <span style={{ flex: 1, height: 1, background: 'var(--border, #ece7e2)' }} />
        </div>

        <GoogleSignInButton onAuth={handleAuthSuccess} />

        <p className={styles.footer} style={{ marginTop: 20 }}>
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
