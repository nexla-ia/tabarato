type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'

const CFG: Record<Status, { label: string; color: string; bg: string; dot: string }> = {
  PENDING:   { label: 'Pendente',  color: '#92400E', bg: '#FEF3C7', dot: '#F59E0B' },
  APPROVED:  { label: 'Aprovado',  color: '#14532D', bg: '#DCFCE7', dot: '#16A34A' },
  REJECTED:  { label: 'Rejeitado', color: '#7F1D1D', bg: '#FEE2E2', dot: '#DC2626' },
  SUSPENDED: { label: 'Suspenso',  color: '#7A5C4A', bg: '#F0E8E0', dot: '#BBA898' },
}

export function StatusBadge({ status, inline }: { status: Status; inline?: boolean }) {
  const c = CFG[status] ?? { label: status, color: '#7A5C4A', bg: '#F0E8E0', dot: '#BBA898' }
  return (
    <span style={{
      display: inline ? 'inline-flex' : 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 9px 3px 7px',
      borderRadius: 6,
      background: c.bg,
      color: c.color,
      fontSize: 11.5,
      fontWeight: 600,
      fontFamily: "'DM Sans', sans-serif",
      letterSpacing: '0.01em',
      whiteSpace: 'nowrap' as const,
      lineHeight: 1.6,
    }}>
      <span style={{
        width: 5.5,
        height: 5.5,
        borderRadius: '50%',
        background: c.dot,
        flexShrink: 0,
        display: 'inline-block',
      }} />
      {c.label}
    </span>
  )
}
