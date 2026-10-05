'use client'
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

/**
 * Toast + confirmação do site.
 *
 * Substitui `alert()` e `confirm()` nativos: além de feios e fora da identidade,
 * o diálogo do navegador trava a página inteira e em alguns contextos (iframe,
 * app embutido) simplesmente não aparece — a ação sumia sem explicação.
 *
 * `confirm()` devolve uma Promise<boolean>, então o código chamador continua
 * lendo igual ao nativo: `if (!(await confirm({...}))) return`.
 */

type ToastKind = 'success' | 'error' | 'info'
type ToastItem = { id: number; kind: ToastKind; message: string }

type ConfirmOptions = {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

type DialogsApi = {
  toast: (message: string, kind?: ToastKind) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const Ctx = createContext<DialogsApi | null>(null)

export function useDialogs(): DialogsApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDialogs precisa estar dentro de <DialogsProvider>')
  return ctx
}

const TONE: Record<ToastKind, { bg: string; fg: string; border: string; Icon: typeof Info }> = {
  success: { bg: '#DCFCE7', fg: '#15803D', border: '#A7F3D0', Icon: CheckCircle2 },
  error: { bg: '#FEE2E2', fg: '#B91C1C', border: '#FECACA', Icon: AlertTriangle },
  info: { bg: '#DBEAFE', fg: '#1D4ED8', border: '#BFDBFE', Icon: Info },
}

export function DialogsProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [ask, setAsk] = useState<(ConfirmOptions & { id: number }) | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)
  const nextId = useRef(1)

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = nextId.current++
    setToasts((t) => [...t, { id, kind, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }, [])

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
      setAsk({ ...options, id: nextId.current++ })
    })
  }, [])

  const settle = (value: boolean) => {
    setAsk(null)
    resolver.current?.(value)
    resolver.current = null
  }

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}

      {/* Toasts */}
      <div style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999,
        width: 'min(420px, calc(100vw - 32px))',
      }}>
        {toasts.map((t) => {
          const tone = TONE[t.kind]
          return (
            <div
              key={t.id}
              role="status"
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`,
                borderRadius: 12, padding: '12px 14px', fontSize: 13.5, fontWeight: 600,
                boxShadow: '0 6px 20px rgba(0,0,0,0.12)', lineHeight: 1.45,
              }}
            >
              <tone.Icon size={17} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ flex: 1 }}>{t.message}</span>
              <button
                onClick={() => setToasts((x) => x.filter((i) => i.id !== t.id))}
                aria-label="Fechar aviso"
                style={{ background: 'none', border: 'none', color: tone.fg, cursor: 'pointer', padding: 0, opacity: 0.7 }}
              >
                <X size={15} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Confirmação */}
      {ask && (
        <div
          onClick={() => settle(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{
              background: 'var(--card)', borderRadius: 16, padding: 22,
              width: 'min(420px, 100%)', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            }}
          >
            <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: '0 0 6px' }}>{ask.title}</h3>
            {ask.message && (
              <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '0 0 18px', lineHeight: 1.5 }}>{ask.message}</p>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => settle(false)}
                style={{
                  flex: 1, padding: 11, borderRadius: 10, cursor: 'pointer',
                  background: 'transparent', border: '1px solid var(--border)',
                  fontSize: 14, fontWeight: 700, color: 'var(--muted)',
                }}
              >{ask.cancelText ?? 'Cancelar'}</button>
              <button
                onClick={() => settle(true)}
                autoFocus
                style={{
                  flex: 1, padding: 11, borderRadius: 10, cursor: 'pointer', border: 'none',
                  background: ask.danger ? '#DC2626' : 'var(--orange)', color: '#fff',
                  fontSize: 14, fontWeight: 800,
                }}
              >{ask.confirmText ?? 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}
