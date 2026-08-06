'use client'
import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ShoppingBag, LayoutDashboard, Store as StoreIcon, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { formatPhone, onlyDigits } from '@/lib/masks'
import styles from './page.module.css'

const ADDR_ICONS: Record<string, string> = {
  Casa: '🏠', Trabalho: '💼', 'Casa dos pais': '👨‍👩‍👧', Outro: '📍',
}
function addrIcon(label: string) { return ADDR_ICONS[label] ?? '📍' }

interface Address {
  id: string; label: string; street: string; number: string
  complement?: string; district: string; city: string; state: string; isDefault: boolean
}

interface UserProfile { id: string; name: string; email: string; phone?: string; role: string }

export default function ProfilePage() {
  const { user, ready, logout } = useAuth()
  const router = useRouter()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [name, setName]   = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPass, setShowCurrentPass] = useState(false)
  const [showNewPass, setShowNewPass] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    if (!ready) return
    if (!user) { router.push('/login'); return }

    // Buscas independentes: uma falha em endereços não deve zerar o perfil inteiro.
    api.get<UserProfile>('/users/me')
      .then((p) => {
        setProfile(p.data)
        setName(p.data.name)
        setPhone(formatPhone(p.data.phone ?? ''))
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))

    api.get<Address[]>('/users/me/addresses')
      .then((a) => setAddresses(a.data))
      .catch(() => {})
  }, [user, ready])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setSaveMsg(null)
    try {
      const { data } = await api.patch<UserProfile>('/users/me', {
        name: name.trim(),
        phone: onlyDigits(phone) || undefined,
      })
      setProfile(data)
      setSaveMsg({ type: 'ok', text: 'Perfil atualizado com sucesso!' })
    } catch {
      setSaveMsg({ type: 'err', text: 'Não foi possível salvar. Tente novamente.' })
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 4000)
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setPwMsg(null)
    if (newPassword.length < 6) { setPwMsg({ type: 'err', text: 'A nova senha deve ter ao menos 6 caracteres.' }); return }
    if (newPassword !== confirmPassword) { setPwMsg({ type: 'err', text: 'As senhas não coincidem.' }); return }

    setPwSaving(true)
    try {
      await api.patch('/users/me/password', { currentPassword, newPassword })
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      setPwMsg({ type: 'ok', text: 'Senha alterada com sucesso!' })
    } catch (err: any) {
      setPwMsg({ type: 'err', text: err.response?.data?.message ?? 'Não foi possível trocar a senha.' })
    } finally {
      setPwSaving(false)
      setTimeout(() => setPwMsg(null), 5000)
    }
  }

  async function handleDeleteAddr(id: string) {
    if (!confirm('Remover este endereço?')) return
    setDeletingId(id)
    try {
      await api.delete(`/users/me/addresses/${id}`)
      setAddresses(prev => prev.filter(a => a.id !== id))
    } catch {} finally {
      setDeletingId(null)
    }
  }

  function handleLogout() {
    logout()
    router.push('/')
  }

  const roleLabel: Record<string, string> = {
    CONSUMER: 'Consumidor', STORE_OWNER: 'Lojista', COURIER: 'Entregador', ADMIN: 'Admin',
  }

  if (!ready || loading) {
    return (
      <>
        <Navbar />
        <div style={{ padding: 80, textAlign: 'center', color: 'var(--muted)', fontSize: 15 }}>
          Carregando perfil...
        </div>
      </>
    )
  }

  if (!user) return null
  // Falha ao carregar o perfil: mostra erro em vez de tela branca.
  if (!profile) {
    return (
      <>
        <Navbar />
        <div style={{ padding: 80, textAlign: 'center', color: 'var(--muted)', fontSize: 15 }}>
          {loadError ? 'Não foi possível carregar seu perfil. Recarregue a página e tente novamente.' : 'Carregando perfil...'}
        </div>
      </>
    )
  }

  return (
    <>
      <Navbar />
      <div className={styles.page}>
        {/* Hero */}
        <div className={styles.hero}>
          <div className="container">
            <div className={styles.heroInner}>
              <div className={styles.avatarCircle}>{profile.name[0]?.toUpperCase()}</div>
              <div>
                <div className={styles.heroName}>{profile.name}</div>
                <div className={styles.heroEmail}>{profile.email}</div>
                <span className={styles.heroBadge}>{roleLabel[profile.role] ?? profile.role}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="container">
          <div className={styles.body}>

            {/* Quick links */}
            <div className={styles.quickLinks}>
              <Link href="/orders" className={styles.quickLink}>
                <span className={styles.quickIcon}><ShoppingBag size={20} /></span>
                <span className={styles.quickText}>
                  <span className={styles.quickTitle}>Meus pedidos</span>
                  <span className={styles.quickSub}>Acompanhe suas compras</span>
                </span>
                <ChevronRight size={18} className={styles.quickChev} />
              </Link>
              {profile.role === 'STORE_OWNER' && (
                <Link href="/lojista" className={styles.quickLink}>
                  <span className={styles.quickIcon}><LayoutDashboard size={20} /></span>
                  <span className={styles.quickText}>
                    <span className={styles.quickTitle}>Meu painel</span>
                    <span className={styles.quickSub}>Gerencie sua loja</span>
                  </span>
                  <ChevronRight size={18} className={styles.quickChev} />
                </Link>
              )}
              <Link href="/" className={styles.quickLink}>
                <span className={styles.quickIcon}><StoreIcon size={20} /></span>
                <span className={styles.quickText}>
                  <span className={styles.quickTitle}>Explorar lojas</span>
                  <span className={styles.quickSub}>Peça do comércio local</span>
                </span>
                <ChevronRight size={18} className={styles.quickChev} />
              </Link>
            </div>

            {/* Edit profile */}
            <div className={styles.card}>
              <div className={styles.sectionTitle}>Informações pessoais</div>
              <form onSubmit={handleSave}>
                <div className={styles.formRow}>
                  <div>
                    <div className={styles.label}>Nome</div>
                    <input
                      className={styles.input} value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Seu nome completo" required
                    />
                  </div>
                  <div>
                    <div className={styles.label}>Telefone</div>
                    <input
                      className={styles.input} value={phone} type="tel"
                      onChange={e => setPhone(formatPhone(e.target.value))}
                      placeholder="(69) 99999-9999"
                    />
                  </div>
                </div>
                <div style={{ marginTop: 14 }}>
                  <div className={styles.label}>E-mail</div>
                  <input className={styles.input} value={profile.email} disabled />
                </div>
                {saveMsg && (
                  <div className={saveMsg.type === 'ok' ? styles.successMsg : styles.errorMsg}>
                    {saveMsg.text}
                  </div>
                )}
                <button className={styles.saveBtn} type="submit" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </form>
            </div>

            {/* Trocar senha */}
            <div className={styles.card}>
              <div className={styles.sectionTitle}>Trocar senha</div>
              <form onSubmit={handleChangePassword}>
                <div className={styles.label}>Senha atual</div>
                <div className={styles.passField}>
                  <input
                    className={styles.input} type={showCurrentPass ? 'text' : 'password'}
                    value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Sua senha atual" required
                  />
                  <button type="button" className={styles.eye} onClick={() => setShowCurrentPass(v => !v)}>
                    {showCurrentPass ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>

                <div className={styles.formRow} style={{ marginTop: 14 }}>
                  <div>
                    <div className={styles.label}>Nova senha</div>
                    <div className={styles.passField}>
                      <input
                        className={styles.input} type={showNewPass ? 'text' : 'password'}
                        value={newPassword} onChange={e => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres" required
                      />
                      <button type="button" className={styles.eye} onClick={() => setShowNewPass(v => !v)}>
                        {showNewPass ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <div className={styles.label}>Confirmar nova senha</div>
                    <input
                      className={styles.input} type={showNewPass ? 'text' : 'password'}
                      value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Repita a nova senha" required
                    />
                  </div>
                </div>

                {pwMsg && (
                  <div className={pwMsg.type === 'ok' ? styles.successMsg : styles.errorMsg}>
                    {pwMsg.text}
                  </div>
                )}
                <button className={styles.saveBtn} type="submit" disabled={pwSaving}>
                  {pwSaving ? 'Trocando...' : 'Trocar senha'}
                </button>
              </form>
            </div>

            {/* Addresses */}
            <div className={styles.card}>
              <div className={styles.sectionTitle}>Meus endereços</div>
              {addresses.length === 0 ? (
                <div className={styles.emptyAddr}>
                  Nenhum endereço salvo ainda. Adicione um no checkout!
                </div>
              ) : (
                <div className={styles.addrList}>
                  {addresses.map(addr => (
                    <div key={addr.id} className={styles.addrItem}>
                      <div className={styles.addrLeft}>
                        <div className={styles.addrIcon}>{addrIcon(addr.label)}</div>
                        <div>
                          <div className={styles.addrLabel}>
                            {addr.label}
                            {addr.isDefault && <span className={styles.defaultBadge}>padrão</span>}
                          </div>
                          <div className={styles.addrStreet}>
                            {addr.street}, {addr.number}
                            {addr.complement ? `, ${addr.complement}` : ''} — {addr.district}, {addr.city}/{addr.state}
                          </div>
                        </div>
                      </div>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDeleteAddr(addr.id)}
                        disabled={deletingId === addr.id}
                      >
                        {deletingId === addr.id ? '...' : 'Remover'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Danger zone */}
            <div className={`${styles.card} ${styles.dangerCard}`}>
              <div className={styles.sectionTitle}>Conta</div>
              <button className={styles.logoutBtn} onClick={handleLogout}>
                Sair da conta
              </button>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
