import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const O = '#FF6600'
const SANS = "'DM Sans', sans-serif"

function LayoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1"/>
      <rect x="14" y="3" width="7" height="5" rx="1"/>
      <rect x="14" y="12" width="7" height="9" rx="1"/>
      <rect x="3" y="16" width="7" height="5" rx="1"/>
    </svg>
  )
}

function BikeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="17.5" r="3"/><circle cx="18.5" cy="17.5" r="3"/>
      <path d="M5.5 14.5 9 8l3 6.5M15 6a1 1 0 0 0-1-1h-2"/><path d="M15 6l3 5H8"/>
    </svg>
  )
}

function ShopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

function ExitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}

function ReceiptIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/>
      <path d="M16 8H8M16 12H8M12 16H8"/>
    </svg>
  )
}

const NAV = [
  { to: '/dashboard', label: 'Dashboard',    Icon: LayoutIcon },
  { to: '/orders',    label: 'Pedidos',      Icon: ReceiptIcon },
  { to: '/couriers',  label: 'Entregadores', Icon: BikeIcon },
  { to: '/stores',    label: 'Lojas',        Icon: ShopIcon },
  { to: '/users',     label: 'Usuários',     Icon: PeopleIcon },
]

export function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <aside style={{
      width: 220,
      height: '100vh',
      background: '#1A0A00',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      borderRight: '1px solid rgba(255,251,247,0.05)',
    }}>
      {/* Brand */}
      <div style={{ padding: '24px 16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34,
            background: O,
            borderRadius: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
            fontSize: 13,
            fontWeight: 800,
            fontFamily: SANS,
            letterSpacing: '-0.03em',
            flexShrink: 0,
          }}>
            TB
          </div>
          <div>
            <div style={{
              color: '#FFFBF7',
              fontFamily: SANS,
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}>
              Tá Barato
            </div>
            <div style={{
              color: O,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.16em',
              marginTop: 3,
              fontFamily: SANS,
            }}>
              ADMIN
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: 'rgba(255,251,247,0.06)', margin: '0 16px 12px' }} />

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0 8px' }}>
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '8px 12px',
              borderRadius: 8,
              marginBottom: 1,
              textDecoration: 'none',
              fontSize: 13.5,
              fontFamily: SANS,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? O : 'rgba(255,251,247,0.4)',
              background: isActive ? 'rgba(255,102,0,0.12)' : 'transparent',
              transition: 'all 0.12s',
            })}
            onMouseEnter={e => {
              const el = e.currentTarget
              if (!el.classList.contains('active') && el.style.color.includes('0.4')) {
                el.style.color = 'rgba(255,251,247,0.72)'
                el.style.background = 'rgba(255,251,247,0.05)'
              }
            }}
            onMouseLeave={e => {
              const el = e.currentTarget
              if (!el.classList.contains('active') && !el.style.color.includes('102')) {
                el.style.color = 'rgba(255,251,247,0.4)'
                el.style.background = 'transparent'
              }
            }}
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User + Logout */}
      <div style={{ padding: '12px 8px 20px' }}>
        <div style={{ height: 1, background: 'rgba(255,251,247,0.06)', marginBottom: 12 }} />

        <div style={{ padding: '6px 12px 10px', display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 28, height: 28,
            borderRadius: '50%',
            background: 'rgba(255,102,0,0.2)',
            border: '1.5px solid rgba(255,102,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: O,
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
            fontFamily: SANS,
          }}>
            {user?.name?.[0]?.toUpperCase() ?? 'A'}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{
              color: 'rgba(255,251,247,0.82)',
              fontSize: 12.5,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.2,
              fontFamily: SANS,
            }}>
              {user?.name ?? 'Admin'}
            </div>
            <div style={{ color: 'rgba(255,251,247,0.25)', fontSize: 11, marginTop: 1, fontFamily: SANS }}>
              Administrador
            </div>
          </div>
        </div>

        <button
          onClick={() => { logout(); navigate('/login') }}
          style={{
            width: '100%',
            padding: '7px 12px',
            background: 'transparent',
            border: 'none',
            borderRadius: 8,
            color: 'rgba(255,251,247,0.28)',
            cursor: 'pointer',
            fontSize: 13,
            fontFamily: SANS,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.12s',
            textAlign: 'left' as const,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'rgba(255,251,247,0.62)'
            e.currentTarget.style.background = 'rgba(255,251,247,0.05)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'rgba(255,251,247,0.28)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <ExitIcon />
          Sair
        </button>
      </div>
    </aside>
  )
}
