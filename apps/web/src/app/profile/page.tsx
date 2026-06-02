'use client'
import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
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

  const [name, setName]   = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    if (!user) { router.push('/login'); return }

    Promise.all([
      api.get<UserProfile>('/users/me'),
      api.get<Address[]>('/users/me/addresses'),
    ])
      .then(([p, a]) => {
        setProfile(p.data)
        setName(p.data.name)
        setPhone(p.data.phone ?? '')
        setAddresses(a.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user, ready])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setSaveMsg(null)
    try {
      const { data } = await api.patch<UserProfile>('/users/me', {
        name: name.trim(),
        phone: phone.trim() || undefined,
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

  if (!user || !profile) return null

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
                      onChange={e => setPhone(e.target.value)}
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
