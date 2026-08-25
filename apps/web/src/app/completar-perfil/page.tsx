'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { reverseCity } from '@/lib/geocoding'

const STATES = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

// Fluxo pós-login social (Google): o Google não fornece cidade/estado. Coleta aqui
// (com opção de GPS), pra deixar o perfil completo — mesma ideia da tela do mobile.
export default function CompletarPerfilPage() {
  const router = useRouter()
  const { user, ready } = useAuth()
  const [city, setCity] = useState('')
  const [state, setState] = useState('RO')
  const [phone, setPhone] = useState('')
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (ready && !user) { router.push('/login?redirect=/completar-perfil'); return }
    api.get('/users/me').then((r) => {
      // Já tem cidade? Não precisa completar — vai pra home.
      if (r.data?.city) { router.push('/'); return }
      if (r.data?.state) setState(r.data.state)
      if (r.data?.phone) setPhone(r.data.phone)
    }).catch(() => {})
  }, [ready, user, router])

  function useMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Geolocalização não disponível neste navegador.')
      return
    }
    setLocating(true); setError('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const found = await reverseCity(pos.coords.latitude, pos.coords.longitude)
        if (found?.city) { setCity(found.city); if (found.state) setState(found.state) }
        else setError('Não consegui identificar sua cidade. Digite manualmente.')
        setLocating(false)
      },
      () => { setError('Permissão de localização negada. Digite sua cidade.'); setLocating(false) },
      { enableHighAccuracy: false, timeout: 10000 },
    )
  }

  async function save() {
    if (!city.trim()) { setError('Informe sua cidade.'); return }
    setSaving(true); setError('')
    try {
      await api.patch('/users/me', { city: city.trim(), state, phone: phone.trim() || undefined })
      router.push('/')
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Não foi possível salvar. Tente de novo.')
    } finally { setSaving(false) }
  }

  const input: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--border, #ece7e2)', fontSize: 15, background: 'var(--card, #fff)' }
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--muted, #9A8880)', marginBottom: 6, display: 'block' }

  return (
    <>
      <Navbar />
      <div className="container" style={{ padding: '40px 20px 60px', maxWidth: 480 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.5, marginBottom: 6 }}>Falta pouco!</h1>
        <p style={{ color: 'var(--muted, #9A8880)', marginBottom: 24, lineHeight: 1.4 }}>
          {user?.name ? `Oi, ${user.name.split(' ')[0]}! ` : ''}Só precisamos de onde você está pra mostrar as lojas certas.
        </p>

        <button
          onClick={useMyLocation}
          disabled={locating}
          style={{ width: '100%', padding: '13px', borderRadius: 12, border: '1.5px solid var(--primary, #FF6600)', background: 'transparent', color: 'var(--primary, #FF6600)', fontWeight: 800, fontSize: 15, cursor: 'pointer', marginBottom: 20 }}
        >
          {locating ? 'Detectando…' : '📍 Usar minha localização'}
        </button>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Cidade *</label>
            <input style={input} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex.: Vilhena" autoFocus />
          </div>
          <div style={{ width: 90 }}>
            <label style={label}>Estado *</label>
            <select style={input} value={state} onChange={(e) => setState(e.target.value)}>
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <label style={label}>Telefone (opcional)</label>
        <input style={{ ...input, marginBottom: 6 }} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(69) 99999-9999" inputMode="tel" />
        <p style={{ fontSize: 12, color: 'var(--muted, #b0a098)', marginBottom: 20 }}>Ajuda a loja e o entregador a falarem com você.</p>

        {error && <p style={{ color: '#DC2626', fontSize: 13, marginBottom: 14 }}>{error}</p>}

        <button
          onClick={save}
          disabled={saving}
          style={{ width: '100%', padding: '15px', borderRadius: 14, border: 'none', background: 'var(--primary, #FF6600)', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}
        >
          {saving ? 'Salvando…' : 'Continuar'}
        </button>
      </div>
    </>
  )
}
