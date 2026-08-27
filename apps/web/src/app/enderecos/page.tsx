'use client'
import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Plus, Pencil, Trash2, Navigation, Star, X } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { api } from '@/lib/api'
import { geocodeAddress, mapsUrl } from '@/lib/geocoding'
import { useAuth } from '@/hooks/useAuth'
import styles from './page.module.css'

interface Address {
  id: string; label: string; street: string; number: string
  complement?: string | null; district: string; city: string; state: string; zipCode: string
  lat: number; lng: number; isDefault: boolean
}

const ADDR_ICONS: Record<string, string> = {
  Casa: '🏠', Trabalho: '💼', 'Casa dos pais': '👨‍👩‍👧', Outro: '📍',
}
function addrIcon(label: string) { return ADDR_ICONS[label] ?? '📍' }

const EMPTY_FORM = { label: '', zipCode: '', street: '', number: '', complement: '', district: '', city: 'Vilhena' }
type FormState = typeof EMPTY_FORM

const FIELDS: { key: keyof FormState; label: string; placeholder: string; required?: boolean }[] = [
  { key: 'label', label: 'Identificação', placeholder: 'Ex: Casa, Trabalho…', required: true },
  { key: 'zipCode', label: 'CEP', placeholder: '76980-000', required: true },
  { key: 'street', label: 'Rua', placeholder: 'Av. Major Amarante', required: true },
  { key: 'number', label: 'Número', placeholder: '123', required: true },
  { key: 'complement', label: 'Complemento (opcional)', placeholder: 'Apto, bloco…' },
  { key: 'district', label: 'Bairro', placeholder: 'Centro', required: true },
  { key: 'city', label: 'Cidade', placeholder: 'Vilhena', required: true },
]

export default function EnderecosPage() {
  const { user, ready } = useAuth()
  const router = useRouter()

  const [addresses, setAddresses] = useState<Address[] | null>(null)
  const [formMode, setFormMode] = useState<'closed' | 'add' | string>('closed')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    if (!user) { router.push('/login?redirect=/enderecos'); return }
    api.get<Address[]>('/users/me/addresses').then(r => setAddresses(r.data)).catch(() => setAddresses([]))
  }, [ready, user, router])

  function openAdd() {
    setForm(EMPTY_FORM)
    setError('')
    setFormMode('add')
  }

  function openEdit(addr: Address) {
    setForm({
      label: addr.label, zipCode: addr.zipCode, street: addr.street, number: addr.number,
      complement: addr.complement ?? '', district: addr.district, city: addr.city,
    })
    setError('')
    setFormMode(addr.id)
  }

  function closeForm() {
    setFormMode('closed')
    setError('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      // Geocodifica o texto digitado — a taxa de entrega usa a distância real
      // até esse ponto, não só o texto do endereço. Sem resultado, mantém as
      // coordenadas anteriores (edição) ou cai num ponto central de Vilhena
      // (cadastro novo) em vez de travar o salvamento.
      const query = `${form.street}, ${form.number}, ${form.district}, ${form.city} - RO, ${form.zipCode}, Brasil`
      const coords = await geocodeAddress(query).catch(() => null)
      const editing = addresses?.find(a => a.id === formMode)
      const payload = {
        label: form.label.trim(), street: form.street.trim(), number: form.number.trim(),
        complement: form.complement.trim() || undefined, district: form.district.trim(),
        city: form.city.trim(), state: 'RO', zipCode: form.zipCode.trim(),
        lat: coords?.lat ?? editing?.lat ?? -12.7406,
        lng: coords?.lng ?? editing?.lng ?? -60.1478,
      }

      if (editing) {
        const { data } = await api.patch<Address>(`/users/me/addresses/${editing.id}`, payload)
        setAddresses(prev => prev!.map(a => (a.id === editing.id ? data : a)))
      } else {
        const { data } = await api.post<Address>('/users/me/addresses', { ...payload, isDefault: addresses?.length === 0 })
        setAddresses(prev => [...(prev ?? []), data])
      }
      closeForm()
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Não foi possível salvar o endereço.')
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este endereço?')) return
    setDeletingId(id)
    try {
      await api.delete(`/users/me/addresses/${id}`)
      setAddresses(prev => prev!.filter(a => a.id !== id))
    } catch (err: any) {
      alert(err.response?.data?.message ?? 'Não foi possível remover este endereço.')
    } finally { setDeletingId(null) }
  }

  async function handleSetDefault(addr: Address) {
    setSettingDefaultId(addr.id)
    try {
      const { data } = await api.patch<Address>(`/users/me/addresses/${addr.id}`, { isDefault: true })
      setAddresses(prev => prev!.map(a => (a.id === addr.id ? data : { ...a, isDefault: false })))
    } catch {} finally { setSettingDefaultId(null) }
  }

  const formCard = (
    <form className={styles.form} onSubmit={handleSubmit}>
      {FIELDS.map(f => (
        <div key={f.key} className={styles.field}>
          <label className={styles.fieldLabel}>{f.label}</label>
          <input
            className={styles.input} required={f.required} placeholder={f.placeholder}
            value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
          />
        </div>
      ))}
      {error && <div className={styles.errorBox}>{error}</div>}
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={closeForm}>Cancelar</button>
        <button type="submit" className={styles.saveBtn} disabled={saving}>{saving ? 'Salvando…' : 'Salvar endereço'}</button>
      </div>
    </form>
  )

  return (
    <>
      <Navbar />
      <div className="container" style={{ padding: '28px 20px 60px', maxWidth: 640 }}>
        <div className={styles.head}>
          <h1 className={styles.title}>Meus endereços</h1>
          {addresses !== null && addresses.length > 0 && formMode === 'closed' && (
            <button type="button" className={styles.addBtn} onClick={openAdd}>
              <Plus size={16} /> Adicionar
            </button>
          )}
        </div>

        {addresses === null ? (
          <div className={styles.loading}>Carregando...</div>
        ) : addresses.length === 0 && formMode === 'closed' ? (
          <div className={styles.empty}>
            <MapPin size={30} strokeWidth={1.5} />
            <p className={styles.emptyTitle}>Nenhum endereço salvo ainda</p>
            <p className={styles.emptySub}>Adicione o endereço da sua casa, trabalho ou qualquer outro lugar pra receber seus pedidos mais rápido.</p>
            <button type="button" className={styles.saveBtn} onClick={openAdd}>
              <Plus size={16} /> Adicionar endereço
            </button>
          </div>
        ) : (
          <div className={styles.list}>
            {addresses.map(addr => (
              <div key={addr.id} className={styles.card}>
                {formMode === addr.id ? (
                  <>
                    <span className={styles.cardIcon}>{addrIcon(addr.label)}</span>
                    <div className={styles.cardBody}>
                      <div className={styles.cardLabelRow}>
                        <span className={styles.cardLabel}>Editando endereço</span>
                        <button type="button" className={styles.closeFormBtn} onClick={closeForm}><X size={15} /></button>
                      </div>
                      {formCard}
                    </div>
                  </>
                ) : (
                  <>
                    <span className={styles.cardIcon}>{addrIcon(addr.label)}</span>
                    <div className={styles.cardBody}>
                      <div className={styles.cardLabelRow}>
                        <span className={styles.cardLabel}>{addr.label}</span>
                        {addr.isDefault && <span className={styles.defaultBadge}><Star size={10} fill="currentColor" /> padrão</span>}
                      </div>
                      <p className={styles.cardAddress}>
                        {addr.street}, {addr.number}{addr.complement ? `, ${addr.complement}` : ''} — {addr.district}, {addr.city}/{addr.state}
                      </p>
                      <div className={styles.cardActions}>
                        {mapsUrl(addr) && (
                          <a href={mapsUrl(addr)!} target="_blank" rel="noopener noreferrer" className={styles.actionLink}>
                            <Navigation size={13} /> Ver no mapa
                          </a>
                        )}
                        {!addr.isDefault && (
                          <button type="button" className={styles.actionLink} onClick={() => handleSetDefault(addr)} disabled={settingDefaultId === addr.id}>
                            <Star size={13} /> {settingDefaultId === addr.id ? 'Definindo…' : 'Tornar padrão'}
                          </button>
                        )}
                        <button type="button" className={styles.actionLink} onClick={() => openEdit(addr)}>
                          <Pencil size={13} /> Editar
                        </button>
                        <button
                          type="button" className={`${styles.actionLink} ${styles.actionDanger}`}
                          onClick={() => handleDelete(addr.id)} disabled={deletingId === addr.id}
                        >
                          <Trash2 size={13} /> {deletingId === addr.id ? 'Removendo…' : 'Remover'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}

            {formMode === 'add' && (
              <div className={styles.card}>
                <span className={styles.cardIcon}><Plus size={16} /></span>
                <div className={styles.cardBody}>
                  <div className={styles.cardLabelRow}>
                    <span className={styles.cardLabel}>Novo endereço</span>
                    <button type="button" className={styles.closeFormBtn} onClick={closeForm}><X size={15} /></button>
                  </div>
                  {formCard}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
