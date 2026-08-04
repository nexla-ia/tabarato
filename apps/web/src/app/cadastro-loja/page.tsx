'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Store, User, CreditCard, MapPin, Check, Loader2, ArrowLeft, ArrowRight,
  Eye, EyeOff, Mail, Lock, Phone, FileText, MessageSquare, Bike, Clock,
  KeyRound, ShieldCheck, PartyPopper,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import styles from './page.module.css'

/* ── máscaras (iguais às do app) ───────────────────────────────────────── */
function onlyDigits(v: string) { return v.replace(/\D/g, '') }
function formatCnpj(v: string) {
  const d = onlyDigits(v).slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}
function formatPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11)
  if (d.length <= 2) return d ? `(${d}` : ''
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

const STEPS = [
  { label: 'Seus dados', Icon: User },
  { label: 'Sua loja', Icon: Store },
  { label: 'Pagamento', Icon: CreditCard },
]

export default function CadastroLojaPage() {
  const router = useRouter()
  const { login, user, ready } = useAuth()

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // conta
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // loja
  const [storeName, setStoreName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [description, setDescription] = useState('')
  const [storePhone, setStorePhone] = useState('')
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)

  // pagamento / entrega
  const [deliveryRadius, setDeliveryRadius] = useState('5')
  const [prepTime, setPrepTime] = useState('30')
  const [pixKey, setPixKey] = useState('')

  // Recupera conta órfã: se já é lojista logado, pula a criação da conta. Se já
  // tem loja, manda pro painel; se não, cai no passo "Sua loja" pra finalizar.
  useEffect(() => {
    if (!ready) return
    if (user?.role === 'STORE_OWNER') {
      api.get('/stores/my')
        .then(() => router.replace('/lojista'))
        .catch((err) => { if (err?.response?.status === 404) setStep(1) })
    }
  }, [ready, user, router])

  function getLocation() {
    if (!navigator.geolocation) { setError('Seu navegador não suporta localização.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false) },
      () => { setLocating(false); setError('Não foi possível obter a localização. Você pode ajustar depois nas configurações da loja.') },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  /* Passo 0 — cria a CONTA (uma única vez). */
  async function submitAccount() {
    setError('')
    if (!name.trim() || !email.trim() || !password) { setError('Preencha nome, e-mail e senha.'); return }
    if (password.length < 6) { setError('A senha deve ter ao menos 6 caracteres.'); return }
    if (password !== confirm) { setError('As senhas não coincidem.'); return }

    setLoading(true)
    try {
      const { data } = await api.post('/auth/register', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: onlyDigits(phone) || undefined,
        password,
        role: 'STORE_OWNER',
      })
      login(data.accessToken, data.user)
      setStep(1)
    } catch (err: any) {
      const raw = err.response?.data?.message ?? 'Não foi possível criar a conta.'
      const msg = Array.isArray(raw) ? raw.join(' ') : String(raw)
      // E-mail já existe → provável conta já criada numa tentativa anterior.
      setError(err.response?.status === 409
        ? `${msg} Se a conta é sua, faça login e volte aqui para finalizar a loja.`
        : msg)
    } finally {
      setLoading(false)
    }
  }

  /* Passo 1 — valida dados da loja (sem chamada de API). */
  function submitStoreInfo() {
    setError('')
    if (!storeName.trim() || !cnpj || !address.trim()) { setError('Preencha nome da loja, CNPJ e endereço.'); return }
    if (onlyDigits(cnpj).length !== 14) { setError('CNPJ inválido — digite os 14 dígitos.'); return }
    setStep(2)
  }

  /* Passo 2 — cria a LOJA (retryável: a conta já existe). */
  async function submitStore() {
    setError('')
    if (!pixKey.trim()) { setError('Informe sua chave PIX para receber pagamentos.'); return }

    setLoading(true)
    try {
      await api.post('/stores', {
        name: storeName.trim(),
        cnpj: onlyDigits(cnpj),
        description: description.trim() || undefined,
        phone: onlyDigits(storePhone) || undefined,
        address: address.trim(),
        lat: coords?.lat ?? -12.7410,
        lng: coords?.lng ?? -60.1402,
        deliveryRadiusKm: Number(deliveryRadius) || 5,
        prepTimeMin: Number(prepTime) || 30,
        pixKey: pixKey.trim(),
      })
      setDone(true)
    } catch (err: any) {
      const raw = err.response?.data?.message ?? 'Não foi possível criar a loja.'
      setError(Array.isArray(raw) ? raw.join(' ') : String(raw))
    } finally {
      setLoading(false)
    }
  }

  function goBack() {
    setError('')
    if (step === 0) router.push('/')
    else setStep((s) => Math.max(0, s - 1))
  }

  /* ── Tela de sucesso: deixa CLARO que a loja fica em análise do admin ── */
  if (done) {
    return (
      <div className={styles.page}>
        <HeroSide />
        <div className={styles.formSide}>
          <div className={`${styles.successCard} ${styles.reveal}`}>
            <div className={styles.successIcon}><PartyPopper size={30} /></div>
            <h2 className={styles.successTitle}>Loja cadastrada! 🎉</h2>
            <p className={styles.successSub}>
              Sua loja <strong>{storeName}</strong> foi enviada e está <strong>em análise</strong>.
              Assim que nosso time aprovar, ela aparece no app e você começa a receber pedidos.
            </p>
            <div className={styles.successSteps}>
              <div className={styles.successStep}><span className={styles.successDot}><Check size={13} /></span> Conta de lojista criada</div>
              <div className={styles.successStep}><span className={styles.successDot}><Check size={13} /></span> Loja enviada para aprovação</div>
              <div className={styles.successStep}><span className={styles.successDotPend} /> Aguardando aprovação do admin</div>
            </div>
            <button className={styles.cta} onClick={() => router.push('/lojista')}>
              Ir para o painel <ArrowRight size={18} />
            </button>
            <p className={styles.footer}>
              Enquanto isso, monte seu cardápio em <Link href="/lojista/produtos" className={styles.link}>Produtos</Link>.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <HeroSide />

      <div className={styles.formSide}>
        <div className={styles.card}>
          <button className={styles.backLink} onClick={goBack} type="button">
            <ArrowLeft size={16} /> {step === 0 ? 'Voltar ao início' : 'Voltar'}
          </button>

          <div className={styles.brandRow}>
            <Image src="/logo.png" alt="Tá Barato" width={40} height={40} style={{ objectFit: 'contain' }} />
            <div>
              <h2 className={styles.formTitle}>Cadastro de Lojista</h2>
              <p className={styles.formSub}>Vilhena, RO · Tá Barato</p>
            </div>
          </div>

          {/* Step indicator */}
          <div className={styles.steps}>
            {STEPS.map((s, i) => {
              const stDone = i < step
              const active = i === step
              return (
                <div key={i} className={styles.stepItem}>
                  {i > 0 && <span className={`${styles.connector} ${(stDone || active) ? styles.connectorOn : ''}`} />}
                  <span className={`${styles.stepDot} ${active ? styles.stepDotActive : ''} ${stDone ? styles.stepDotDone : ''}`}>
                    {stDone ? <Check size={14} /> : <s.Icon size={14} />}
                  </span>
                  <span className={`${styles.stepLabel} ${active ? styles.stepLabelActive : ''}`}>{s.label}</span>
                </div>
              )
            })}
          </div>

          {/* ─── STEP 0 ─── */}
          {step === 0 && (
            <div className={styles.stepBody} key="s0">
              <StepHead Icon={User} title="Seus dados pessoais" desc="Informações da sua conta de acesso" />
              <Field label="Nome completo" Icon={User} value={name} onChange={setName} placeholder="Seu nome completo" />
              <Field label="E-mail" Icon={Mail} value={email} onChange={setEmail} placeholder="seu@email.com" type="email" />
              <Field label="Telefone pessoal" Icon={Phone} value={phone} onChange={(v) => setPhone(formatPhone(v))} placeholder="(69) 99999-0000" />
              <Field
                label="Senha" Icon={Lock} value={password} onChange={setPassword}
                placeholder="Mínimo 6 caracteres" type={showPass ? 'text' : 'password'}
                right={<button type="button" className={styles.eye} onClick={() => setShowPass(v => !v)}>{showPass ? <EyeOff size={17} /> : <Eye size={17} />}</button>}
              />
              <Field
                label="Confirmar senha" Icon={Lock} value={confirm} onChange={setConfirm}
                placeholder="Repita a senha" type={showConfirm ? 'text' : 'password'}
                right={<button type="button" className={styles.eye} onClick={() => setShowConfirm(v => !v)}>{showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}</button>}
              />
              {error && <div className={styles.error}>{error}</div>}
              <button className={styles.cta} onClick={submitAccount} disabled={loading}>
                {loading ? <Loader2 size={18} className={styles.spin} /> : <>Continuar <ArrowRight size={18} /></>}
              </button>
            </div>
          )}

          {/* ─── STEP 1 ─── */}
          {step === 1 && (
            <div className={styles.stepBody} key="s1">
              <StepHead Icon={Store} title="Dados da sua loja" desc="Como os clientes vão te encontrar" />
              <Field label="Nome da loja *" Icon={Store} value={storeName} onChange={setStoreName} placeholder="Ex: Burguer do Zé" />
              <Field label="CNPJ *" Icon={FileText} value={cnpj} onChange={(v) => setCnpj(formatCnpj(v))} placeholder="00.000.000/0000-00" />
              <Field label="Descrição da loja" Icon={MessageSquare} value={description} onChange={setDescription} placeholder="Conte um pouco sobre seu estabelecimento..." multiline />
              <Field label="Telefone da loja" Icon={Phone} value={storePhone} onChange={(v) => setStorePhone(formatPhone(v))} placeholder="(69) 99999-0000" />
              <Field label="Endereço completo *" Icon={MapPin} value={address} onChange={setAddress} placeholder="Rua, número, bairro — Vilhena, RO" />

              {coords ? (
                <div className={styles.locOk}>
                  <Check size={17} />
                  <div>
                    <strong>Localização definida</strong>
                    <span>{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</span>
                  </div>
                  <button type="button" onClick={getLocation} disabled={locating} className={styles.locRetry}>Atualizar</button>
                </div>
              ) : (
                <button type="button" className={styles.locBtn} onClick={getLocation} disabled={locating}>
                  {locating ? <Loader2 size={16} className={styles.spin} /> : <MapPin size={16} />}
                  Usar minha localização (estou na loja)
                </button>
              )}

              {error && <div className={styles.error}>{error}</div>}
              <button className={styles.cta} onClick={submitStoreInfo}>Continuar <ArrowRight size={18} /></button>
            </div>
          )}

          {/* ─── STEP 2 ─── */}
          {step === 2 && (
            <div className={styles.stepBody} key="s2">
              <StepHead Icon={CreditCard} title="Entrega & Pagamento" desc="Configure como você entrega e recebe" />
              <div className={styles.grid2}>
                <Field label="Raio de entrega (km)" Icon={Bike} value={deliveryRadius} onChange={setDeliveryRadius} placeholder="5" type="number" />
                <Field label="Preparo (min)" Icon={Clock} value={prepTime} onChange={setPrepTime} placeholder="30" type="number" />
              </div>
              <Field label="Chave PIX *" Icon={KeyRound} value={pixKey} onChange={setPixKey} placeholder="CPF, CNPJ, e-mail ou telefone" />

              <div className={styles.infoBox}>
                <ShieldCheck size={16} />
                <span>O pagamento é depositado diretamente na sua chave PIX após a confirmação de entrega.</span>
              </div>

              <div className={styles.summary}>
                <span className={styles.summaryTitle}>Resumo do cadastro</span>
                <SummaryRow Icon={User} label="Responsável" value={name} />
                <SummaryRow Icon={Mail} label="E-mail" value={email} />
                <SummaryRow Icon={Store} label="Loja" value={storeName} />
                <SummaryRow Icon={MapPin} label="Endereço" value={address} />
              </div>

              {error && <div className={styles.error}>{error}</div>}
              <button className={styles.cta} onClick={submitStore} disabled={loading}>
                {loading ? <Loader2 size={18} className={styles.spin} /> : <><Check size={18} /> Criar minha loja</>}
              </button>
            </div>
          )}

          <p className={styles.footer}>Já tem conta? <Link href="/login" className={styles.link}>Entrar</Link></p>
        </div>
      </div>
    </div>
  )
}

/* ── Subcomponentes ────────────────────────────────────────────────────── */
type Ic = React.ComponentType<{ size?: number | string; className?: string }>

function HeroSide() {
  return (
    <div className={styles.hero}>
      <div className={styles.heroGlow} />
      <div className={styles.heroInner}>
        <div className={styles.heroBadge}><Store size={15} /> Para lojistas</div>
        <h1 className={styles.heroTitle}>Venda no<br /><span className={styles.heroAccent}>Tá Barato</span></h1>
        <p className={styles.heroSub}>Cadastre sua loja e comece a receber pedidos em Vilhena hoje mesmo.</p>
        <ul className={styles.heroList}>
          <li><Check size={14} /> Receba pedidos em tempo real</li>
          <li><Check size={14} /> Entregadores da plataforma</li>
          <li><Check size={14} /> Pagamento direto na sua chave PIX</li>
        </ul>
      </div>
    </div>
  )
}

function StepHead({ Icon, title, desc }: { Icon: Ic; title: string; desc: string }) {
  return (
    <div className={styles.stepHead}>
      <span className={styles.stepHeadIcon}><Icon size={20} /></span>
      <div>
        <h3 className={styles.stepHeadTitle}>{title}</h3>
        <p className={styles.stepHeadDesc}>{desc}</p>
      </div>
    </div>
  )
}

function Field({
  label, Icon, value, onChange, placeholder, type = 'text', multiline, right,
}: {
  label: string; Icon: Ic; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; multiline?: boolean; right?: React.ReactNode
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={`${styles.fieldRow} ${multiline ? styles.fieldRowMulti : ''}`}>
        <Icon size={17} className={styles.fieldIcon} />
        {multiline ? (
          <textarea className={styles.input} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} />
        ) : (
          <input
            className={styles.input} value={value} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} type={type}
            inputMode={type === 'number' ? 'numeric' : undefined}
            autoCapitalize={type === 'email' ? 'none' : undefined}
          />
        )}
        {right}
      </span>
    </label>
  )
}

function SummaryRow({ Icon, label, value }: { Icon: Ic; label: string; value: string }) {
  if (!value) return null
  return (
    <span className={styles.summaryRow}>
      <Icon size={13} />
      <span className={styles.summaryLabel}>{label}</span>
      <span className={styles.summaryValue}>{value}</span>
    </span>
  )
}
