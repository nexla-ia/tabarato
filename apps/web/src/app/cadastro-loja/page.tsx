'use client'
import { useEffect, useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Store, User, CreditCard, MapPin, Check, Loader2, ArrowLeft, Tag } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import styles from './page.module.css'

interface Category { id: string; name: string; icon?: string | null }

function onlyDigits(v: string) { return v.replace(/\D/g, '') }
function formatCnpj(v: string) {
  const d = onlyDigits(v).slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

export default function CadastroLojaPage() {
  const router = useRouter()
  const { login } = useAuth()

  // conta
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  // loja
  const [storeName, setStoreName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [deliveryRadius, setDeliveryRadius] = useState('5')
  const [prepTime, setPrepTime] = useState('30')
  const [pixKey, setPixKey] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCats, setSelectedCats] = useState<string[]>([])

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get<Category[]>('/stores/categories').then(({ data }) => setCategories(data)).catch(() => setCategories([]))
  }, [])

  function toggleCat(id: string) {
    setSelectedCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  function getLocation() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false) },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('A senha deve ter ao menos 6 caracteres.'); return }
    if (onlyDigits(cnpj).length !== 14) { setError('CNPJ inválido — digite os 14 dígitos.'); return }
    if (!pixKey.trim()) { setError('Informe sua chave PIX para receber pagamentos.'); return }
    if (selectedCats.length === 0) { setError('Selecione ao menos uma categoria pra sua loja.'); return }

    setLoading(true)
    try {
      // 1) cria a conta do lojista
      const { data } = await api.post('/auth/register', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone || undefined,
        password,
        role: 'STORE_OWNER',
      })
      login(data.accessToken, data.user)

      // 2) cria a loja (token já aplicado pelo login)
      await api.post('/stores', {
        name: storeName.trim(),
        cnpj: onlyDigits(cnpj),
        description: description.trim() || undefined,
        phone: phone || undefined,
        address: address.trim(),
        lat: coords?.lat ?? -12.7410,
        lng: coords?.lng ?? -60.1402,
        deliveryRadiusKm: Number(deliveryRadius) || 5,
        prepTimeMin: Number(prepTime) || 30,
        pixKey: pixKey.trim(),
      })

      // 3) vincula as categorias escolhidas (sem isso a loja não aparece em nenhum filtro)
      for (const catId of selectedCats) {
        await api.post(`/stores/my/categories/${catId}`).catch(() => {})
      }

      router.push('/lojista')
    } catch (err: any) {
      const raw = err.response?.data?.message ?? 'Não foi possível concluir o cadastro.'
      setError(Array.isArray(raw) ? raw.join(' ') : String(raw))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroBadge}><Store size={16} /> Para lojistas</div>
          <h1 className={styles.heroTitle}>Venda no Tá Barato</h1>
          <p className={styles.heroSub}>Cadastre sua loja e comece a receber pedidos em Vilhena hoje mesmo.</p>
          <ul className={styles.heroList}>
            <li><Check size={15} /> Receba pedidos em tempo real</li>
            <li><Check size={15} /> Entregadores da plataforma</li>
            <li><Check size={15} /> Pagamento direto na sua chave PIX</li>
          </ul>
        </div>
      </div>

      <div className={styles.formSide}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <Link href="/" className={styles.backLink}><ArrowLeft size={16} /> Voltar ao início</Link>
          <h2 className={styles.formTitle}>Cadastro de lojista</h2>

          <div className={styles.section}><User size={15} /> Seus dados</div>
          <div className={styles.grid2}>
            <div><label className={styles.label}>Nome *</label><input className={styles.input} required value={name} onChange={e => setName(e.target.value)} /></div>
            <div><label className={styles.label}>Telefone</label><input className={styles.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(69) 9…" /></div>
          </div>
          <label className={styles.label}>E-mail *</label>
          <input className={styles.input} type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          <label className={styles.label}>Senha *</label>
          <input className={styles.input} type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />

          <div className={styles.section}><Store size={15} /> Sua loja</div>
          <div className={styles.grid2}>
            <div><label className={styles.label}>Nome da loja *</label><input className={styles.input} required value={storeName} onChange={e => setStoreName(e.target.value)} /></div>
            <div><label className={styles.label}>CNPJ *</label><input className={styles.input} required value={cnpj} onChange={e => setCnpj(formatCnpj(e.target.value))} placeholder="00.000.000/0000-00" /></div>
          </div>
          <label className={styles.label}>Descrição</label>
          <textarea className={styles.input} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Sobre sua loja…" />

          <label className={styles.label}><Tag size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Categoria da loja *</label>
          <div className={styles.catGrid}>
            {categories.map(c => (
              <button
                type="button"
                key={c.id}
                className={`${styles.catChip} ${selectedCats.includes(c.id) ? styles.catChipActive : ''}`}
                onClick={() => toggleCat(c.id)}
              >
                {selectedCats.includes(c.id) && <Check size={13} />}
                {c.name}
              </button>
            ))}
          </div>
          <p className={styles.hint}>Escolha uma ou mais — é assim que sua loja aparece nos filtros de busca.</p>
          <label className={styles.label}>Endereço *</label>
          <input className={styles.input} required value={address} onChange={e => setAddress(e.target.value)} placeholder="Rua, número, bairro — Vilhena, RO" />
          <button type="button" className={`${styles.locBtn} ${coords ? styles.locOk : ''}`} onClick={getLocation} disabled={locating}>
            {locating ? <Loader2 size={15} className={styles.spin} /> : coords ? <Check size={15} /> : <MapPin size={15} />}
            {coords ? `Localização definida (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})` : 'Usar minha localização atual'}
          </button>

          <div className={styles.grid2}>
            <div><label className={styles.label}>Raio de entrega (km)</label><input className={styles.input} type="number" value={deliveryRadius} onChange={e => setDeliveryRadius(e.target.value)} /></div>
            <div><label className={styles.label}>Preparo (min)</label><input className={styles.input} type="number" value={prepTime} onChange={e => setPrepTime(e.target.value)} /></div>
          </div>

          <div className={styles.section}><CreditCard size={15} /> Pagamento</div>
          <label className={styles.label}>Chave PIX *</label>
          <input className={styles.input} required value={pixKey} onChange={e => setPixKey(e.target.value)} placeholder="CPF, CNPJ, e-mail ou telefone" />

          {error && <div className={styles.error}>{error}</div>}

          <button className={styles.submit} type="submit" disabled={loading}>
            {loading ? 'Criando sua loja…' : 'Criar minha loja'}
          </button>
          <p className={styles.footer}>Já tem conta? <Link href="/login" className={styles.link}>Entrar</Link></p>
        </form>
      </div>
    </div>
  )
}
