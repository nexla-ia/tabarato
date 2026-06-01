import { useToast } from '../context/ToastContext'

const CFG: Record<string, { bg: string; border: string }> = {
  success: { bg: '#1A0A00', border: 'rgba(34,197,94,0.4)' },
  error:   { bg: '#1A0A00', border: 'rgba(239,68,68,0.4)' },
  info:    { bg: '#1A0A00', border: 'rgba(255,255,255,0.1)' },
}

const ICON: Record<string, string> = { success: '✓', error: '✕', info: 'i' }
const ICON_COLOR: Record<string, string> = { success: '#22C55E', error: '#EF4444', info: '#BBA898' }

export function Toast() {
  const { toasts } = useToast()
  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      zIndex: 9999,
      pointerEvents: 'none',
    }}>
      {toasts.map(t => {
        const cfg = CFG[t.type] ?? CFG.info
        return (
          <div key={t.id} style={{
            padding: '12px 16px',
            borderRadius: 10,
            background: cfg.bg,
            border: `1px solid ${cfg.border}`,
            color: '#FFFBF7',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13.5,
            fontWeight: 500,
            lineHeight: 1.4,
            boxShadow: '0 12px 32px rgba(26,10,0,0.25)',
            animation: 'fadeInUp 0.18s ease',
            maxWidth: 320,
            pointerEvents: 'all',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <span style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: `${ICON_COLOR[t.type]}22`,
              color: ICON_COLOR[t.type] ?? '#BBA898',
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              {ICON[t.type] ?? 'i'}
            </span>
            {t.message}
          </div>
        )
      })}
    </div>
  )
}
