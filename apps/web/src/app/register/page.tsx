'use client'
import { useState, useEffect, Suspense, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { ArrowLeft, ShoppingBag, Store, ArrowRight, Eye, EyeOff } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { formatPhone, onlyDigits } from '@/lib/masks'
import styles from '../login/page.module.css'

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  )
}

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login } = useAuth()
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [phone, setPhone]       = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    const ref = searchParams.get('ref')
    if (ref) setReferralCode(ref.toUpperCase())
  }, [searchParams])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const { data } = await api.post('/auth/register', {
        name, email, password, phone: onlyDigits(phone) || undefined, role: 'CONSUMER',
        referralCode: referralCode.trim() || undefined,
      })
      login(data.accessToken, data.user)
      router.push('/')
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Erro ao criar conta')
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
        <h1 className={styles.title}>Criar conta grátis</h1>
        <p className={styles.sub}>Como você quer usar o Tá Barato?</p>

        {/* Escolha do tipo de conta */}
        <div className={styles.roleTabs}>
          <div className={`${styles.roleTab} ${styles.roleTabActive}`}>
            <span className={styles.roleIcon}><ShoppingBag size={20} /></span>
            <span className={styles.roleName}>Sou cliente</span>
            <span className={styles.roleDesc}>Pedir comida e produtos</span>
          </div>
          <button
            type="button"
            className={styles.roleTab}
            onClick={() => router.push('/cadastro-loja')}
          >
            <span className={styles.roleIcon}><Store size={20} /></span>
            <span className={styles.roleName}>Sou lojista</span>
            <span className={styles.roleDesc}>Vender no Tá Barato</span>
            <span className={styles.roleGo}>Cadastrar loja <ArrowRight size={13} /></span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>Nome</label>
          <input className={styles.input} type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome completo" />

          <label className={styles.label}>E-mail</label>
          <input className={styles.input} type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" />

          <label className={styles.label}>Telefone (opcional)</label>
          <input className={styles.input} type="tel" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="(69) 99999-9999" />

          <label className={styles.label}>Código de indicação (opcional)</label>
          <input
            className={styles.input} type="text" value={referralCode}
            onChange={e => setReferralCode(e.target.value.toUpperCase())}
            placeholder="Ex: A1B2C3D4" maxLength={20}
          />

          <label className={styles.label}>Senha</label>
          <div className={styles.passField}>
            <input
              className={styles.input} type={showPass ? 'text' : 'password'} required
              value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres"
            />
            <button type="button" className={styles.eye} onClick={() => setShowPass(v => !v)}>
              {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Criando conta...' : 'Criar conta de cliente'}
          </button>

          <p className={styles.legalNote}>
            Ao criar a conta você concorda com os{' '}
            <Link href="/termos">Termos de Uso</Link> e com a{' '}
            <Link href="/privacidade">Política de Privacidade</Link>.
          </p>
        </form>

        <p className={styles.footer}>
          Já tem conta?{' '}
          <Link href="/login" className={styles.link}>Entrar</Link>
        </p>
      </div>
    </div>
  )
}
