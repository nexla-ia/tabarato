'use client'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

// Client ID Web do Google (público). Pode ser sobrescrito por env no build.
const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
  '721316096829-1cf2dg6rn1n0vlfp2v44h1uvt6na04hr.apps.googleusercontent.com'
const GSI_SRC = 'https://accounts.google.com/gsi/client'

// Carrega o script do Google Identity Services uma única vez.
function loadGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'))
    if ((window as any).google?.accounts?.id) return resolve()
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('gsi load error')))
      return
    }
    const s = document.createElement('script')
    s.src = GSI_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('gsi load error'))
    document.head.appendChild(s)
  })
}

// Botão oficial "Continuar com Google". No sucesso, chama POST /auth/google com o
// ID token e devolve { user, accessToken, refreshToken } via onAuth.
export function GoogleSignInButton({ onAuth }: { onAuth: (data: any) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const onAuthRef = useRef(onAuth)
  onAuthRef.current = onAuth
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    loadGsi()
      .then(() => {
        if (cancelled || !ref.current) return
        const g = (window as any).google
        g.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (resp: any) => {
            try {
              const { data } = await api.post('/auth/google', { idToken: resp.credential })
              onAuthRef.current(data)
            } catch (e: any) {
              setError(e?.response?.data?.message ?? 'Não foi possível entrar com o Google.')
            }
          },
        })
        g.accounts.id.renderButton(ref.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'left',
          width: 300,
          locale: 'pt-BR',
        })
      })
      .catch(() => setError('Não foi possível carregar o login do Google.'))
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div ref={ref} />
      {error && <span style={{ color: '#DC2626', fontSize: 13, textAlign: 'center' }}>{error}</span>}
    </div>
  )
}
