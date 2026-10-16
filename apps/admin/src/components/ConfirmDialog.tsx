import type { ReactNode } from 'react'

const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const BORDER = '#F0E8E0'
const SANS = "'DM Sans', sans-serif"

export type Tom = 'perigo' | 'aviso' | 'ok'

const TOM: Record<Tom, { botao: string; aviso: string; avisoFg: string; avisoBorda: string }> = {
  perigo: { botao: '#B91C1C', aviso: '#FEF2F2', avisoFg: '#B91C1C', avisoBorda: '#FECACA' },
  aviso:  { botao: '#B45309', aviso: '#FFFBEB', avisoFg: '#92620A', avisoBorda: '#FDE68A' },
  ok:     { botao: '#15803D', aviso: '#ECFDF5', avisoFg: '#047857', avisoBorda: '#A7F3D0' },
}

/**
 * Confirmação com consequência escrita.
 *
 * Existe por dois motivos. O primeiro é tirar os `window.confirm` nativos, que
 * não dizem o que vai acontecer e destoam do painel. O segundo é o que o
 * cliente pediu: as ações de desativar precisam ser fáceis de ENTENDER, não só
 * de achar — por isso `consequencia` é obrigatória e aparece destacada. Quem
 * clica tem que saber se perde histórico, se dá para voltar atrás e o que a
 * pessoa do outro lado vai ver.
 */
export function ConfirmDialog({
  aberto,
  titulo,
  consequencia,
  rotuloConfirmar,
  tom = 'perigo',
  carregando = false,
  onConfirmar,
  onCancelar,
  children,
}: {
  aberto: boolean
  titulo: string
  /** O que muda no mundo se confirmar. Obrigatório de propósito. */
  consequencia: ReactNode
  rotuloConfirmar: string
  tom?: Tom
  carregando?: boolean
  onConfirmar: () => void
  onCancelar: () => void
  /** Contexto extra opcional: resumo do registro afetado. */
  children?: ReactNode
}) {
  if (!aberto) return null
  const c = TOM[tom]

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !carregando) onCancelar() }}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, padding: 20,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 16, width: 'min(440px, 100%)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.25)', overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 22px 16px' }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: TEXT, margin: '0 0 12px', fontFamily: SANS }}>
            {titulo}
          </h3>

          {children}

          <div style={{
            padding: '11px 13px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.55,
            fontFamily: SANS, background: c.aviso, color: c.avisoFg, border: `1px solid ${c.avisoBorda}`,
          }}>
            {consequencia}
          </div>
        </div>

        <div style={{ padding: '14px 22px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 10 }}>
          <button
            onClick={onCancelar}
            disabled={carregando}
            style={{
              flex: 1, padding: 11, borderRadius: 10, border: `1px solid ${BORDER}`,
              background: '#fff', color: MUTED, fontSize: 13.5, fontWeight: 700,
              cursor: carregando ? 'default' : 'pointer', fontFamily: SANS,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={carregando}
            autoFocus
            style={{
              flex: 1, padding: 11, borderRadius: 10, border: 'none',
              background: c.botao, color: '#fff', fontSize: 13.5, fontWeight: 700,
              cursor: carregando ? 'default' : 'pointer', fontFamily: SANS,
              opacity: carregando ? 0.7 : 1,
            }}
          >
            {carregando ? 'Salvando…' : rotuloConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
