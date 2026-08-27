'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Store, User, CreditCard, MapPin, Check, Loader2, ArrowLeft, ArrowRight,
  Eye, EyeOff, Mail, Lock, Phone, FileText, MessageSquare, Bike, Clock,
  ShieldCheck, PartyPopper, Tag,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { onlyDigits, formatCnpj, formatPhone, validateCnpj, joinList } from '@/lib/masks'
import { sortCategoriesOutrosLast } from '@/lib/categoryIcons'
import { lookupCnpj } from '@/lib/cnpjLookup'
import { reverseGeocode } from '@/lib/geocoding'
import { AuthBrandPanel, AuthBrandAccent } from '@/components/AuthBrandPanel'
import styles from './page.module.css'

interface Category { id: string; name: string; icon?: string | null }

const STEPS = [
  { label: 'Seus dados', Icon: User },
  { label: 'Sua loja', Icon: Store },
  { label: 'Pagamento', Icon: CreditCard },
]

// Conteúdo do painel de marca pro cadastro de lojista — logo e largura vêm
// fixos do AuthBrandPanel; só isto (texto/lista) muda em relação a login/cadastro de cliente.
// Tom de boas-vindas (não de pitch de vendas): quem chega aqui já decidiu se
// cadastrar, o painel é pra receber bem, não convencer.
const LOJISTA_BRAND = {
  title: <>Que bom te ver<br /><AuthBrandAccent>por aqui!</AuthBrandAccent></>,
  subtitle: 'Ficamos felizes com sua vontade de vender no Tá Barato. Vamos deixar sua loja pronta em poucos minutos.',
  items: [
    { icon: <Check size={14} />, text: 'Receba pedidos em tempo real' },
    { icon: <Check size={14} />, text: 'Entregadores da plataforma' },
    { icon: <Check size={14} />, text: 'Receba via PIX direto no Mercado Pago' },
  ],
}

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
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCats, setSelectedCats] = useState<string[]>([])
  const [customCategory, setCustomCategory] = useState('')
  const [cnpjStatus, setCnpjStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle')

  // pagamento / entrega
  const [deliveryRadius, setDeliveryRadius] = useState('5')
  const [prepTime, setPrepTime] = useState('30')

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

  // Categorias disponíveis pra vincular à loja.
  useEffect(() => {
    api.get<Category[]>('/stores/categories')
      .then(({ data }) => setCategories(data))
      .catch(() => setCategories([]))
  }, [])

  function toggleCat(id: string) {
    setSelectedCats((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id])
  }

  // "Outros" sempre por último — e some junto com o campo de texto quando desmarcada.
  const sortedCategories = sortCategoriesOutrosLast(categories)
  const outrosCategory = categories.find((c) => c.name.trim().toLowerCase() === 'outros')
  const outrosSelected = !!outrosCategory && selectedCats.includes(outrosCategory.id)

  function getLocation() {
    if (!navigator.geolocation) { setError('Seu navegador não suporta localização.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setCoords({ lat, lng })
        const addr = await reverseGeocode(lat, lng)
        if (addr) setAddress(addr)
        setLocating(false)
      },
      () => { setLocating(false); setError('Não foi possível obter a localização. Você pode ajustar depois nas configurações da loja.') },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  /* Ao sair do campo CNPJ: valida o dígito verificador e, se válido, busca os
     dados públicos da empresa pra auto-preencher nome/endereço (só se vazios). */
  async function handleCnpjBlur() {
    if (onlyDigits(cnpj).length !== 14) { setCnpjStatus('idle'); return }
    if (!validateCnpj(cnpj)) { setCnpjStatus('invalid'); return }
    setCnpjStatus('checking')
    const data = await lookupCnpj(onlyDigits(cnpj))
    setCnpjStatus('valid')
    if (data) {
      if (!storeName.trim() && data.name) setStoreName(data.name)
      if (!address.trim() && data.address) setAddress(data.address)
    }
  }

  /* Passo 0 — cria a CONTA (uma única vez). */
  async function submitAccount() {
    setError('')
    const missing: string[] = []
    if (!name.trim()) missing.push('nome')
    if (!email.trim()) missing.push('e-mail')
    if (!password) missing.push('senha')
    if (missing.length) { setError(`Preencha ${joinList(missing)}.`); return }
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
    const missing: string[] = []
    if (!storeName.trim()) missing.push('nome da loja')
    if (!cnpj) missing.push('CNPJ')
    if (!address.trim()) missing.push('endereço')
    if (missing.length) { setError(`Preencha ${joinList(missing)}.`); return }
    if (!validateCnpj(cnpj)) { setCnpjStatus('invalid'); setError('CNPJ inválido — confira os números digitados.'); return }
    if (selectedCats.length === 0) { setError('Selecione ao menos uma categoria para sua loja.'); return }
    if (outrosSelected && !customCategory.trim()) { setError('Escreva qual é a categoria da sua loja.'); return }
    setStep(2)
  }

  /* Passo 2 — cria a LOJA + vincula categorias (retryável: a conta já existe). */
  async function submitStore() {
    setError('')
    setLoading(true)
    try {
      // Não há campo próprio pra categoria personalizada — anota na descrição
      // pra aparecer pro admin na hora de aprovar a loja.
      const fullDescription = outrosSelected && customCategory.trim()
        ? `Categoria personalizada: ${customCategory.trim()}${description.trim() ? `\n\n${description.trim()}` : ''}`
        : description.trim() || undefined

      await api.post('/stores', {
        name: storeName.trim(),
        cnpj: onlyDigits(cnpj),
        description: fullDescription,
        phone: onlyDigits(storePhone) || undefined,
        address: address.trim(),
        lat: coords?.lat ?? -12.7410,
        lng: coords?.lng ?? -60.1402,
        deliveryRadiusKm: Number(deliveryRadius) || 5,
        prepTimeMin: Number(prepTime) || 30,
      })
      // Vincula as categorias — sem isso a loja não aparece em nenhum filtro/aba.
      for (const catId of selectedCats) {
        await api.post(`/stores/my/categories/${catId}`).catch(() => {})
      }
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
        <AuthBrandPanel sticky {...LOJISTA_BRAND} />
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
      <AuthBrandPanel sticky {...LOJISTA_BRAND} />

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
              <Field
                label="CNPJ / MEI *" Icon={FileText} value={cnpj}
                onChange={(v) => { setCnpj(formatCnpj(v)); setCnpjStatus('idle') }}
                onBlur={handleCnpjBlur}
                placeholder="00.000.000/0000-00"
                hint={
                  cnpjStatus === 'checking' ? <span className={styles.hint}><Loader2 size={12} className={styles.spin} /> Verificando CNPJ…</span> :
                  cnpjStatus === 'valid' ? <span className={styles.hintOk}><Check size={12} /> CNPJ válido</span> :
                  cnpjStatus === 'invalid' ? <span className={styles.hintErr}>CNPJ inválido — confira os números.</span> :
                  <span className={styles.hint}>Se você é MEI, use o mesmo número — sua inscrição de MEI é o seu CNPJ.</span>
                }
              />
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

              <Field label="Descrição da loja" Icon={MessageSquare} value={description} onChange={setDescription} placeholder="Conte um pouco sobre seu estabelecimento..." multiline />

              {/* Categorias — sem ao menos uma, a loja não aparece nos filtros/aba */}
              <div className={styles.field}>
                <span className={styles.fieldLabel}><Tag size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Categoria da loja *</span>
                <div className={styles.catGrid}>
                  {sortedCategories.map((c) => {
                    const active = selectedCats.includes(c.id)
                    return (
                      <button
                        type="button" key={c.id}
                        className={`${styles.catChip} ${active ? styles.catChipActive : ''}`}
                        onClick={() => toggleCat(c.id)}
                      >
                        {active && <Check size={13} />}{c.name}
                      </button>
                    )
                  })}
                </div>
                <p className={styles.hint}>Escolha uma ou mais — é assim que sua loja aparece nas buscas e na aba Categorias.</p>
                {outrosSelected && (
                  <input
                    className={styles.customCatInput}
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="Qual? Ex: Livraria, Pet café…"
                    maxLength={60}
                  />
                )}
              </div>

              <Field label="Telefone da loja" Icon={Phone} value={storePhone} onChange={(v) => setStorePhone(formatPhone(v))} placeholder="(69) 99999-0000" />

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
              <div className={styles.infoBox}>
                <ShieldCheck size={16} />
                <span>Depois de criar a loja, você conecta sua conta Mercado Pago no painel pra receber os pagamentos via PIX automaticamente — sem precisar cadastrar chave manualmente.</span>
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

              <p className={styles.legalNote}>
                Ao criar a loja você concorda com os{' '}
                <Link href="/termos">Termos de Uso</Link> — inclusive com a comissão da
                plataforma e as regras para lojistas — e com a{' '}
                <Link href="/privacidade">Política de Privacidade</Link>.
              </p>
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
  label, Icon, value, onChange, placeholder, type = 'text', multiline, right, hint, onBlur,
}: {
  label: string; Icon: Ic; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; multiline?: boolean; right?: React.ReactNode
  hint?: React.ReactNode; onBlur?: () => void
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
            onBlur={onBlur}
            placeholder={placeholder} type={type}
            inputMode={type === 'number' ? 'numeric' : undefined}
            autoCapitalize={type === 'email' ? 'none' : undefined}
          />
        )}
        {right}
      </span>
      {hint}
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
