import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { Stats } from '../types'

const O = '#FF6600'
const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const BORDER = '#F0E8E0'
const SANS = "'DM Sans', sans-serif"

function StatCard({
  value, label, sub, accent, onClick,
}: {
  value: number
  label: string
  sub: string
  accent: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        borderRadius: 14,
        padding: '24px 24px 20px',
        border: `1px solid ${BORDER}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s, transform 0.15s',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        if (!onClick) return
        e.currentTarget.style.boxShadow = '0 6px 20px rgba(26,10,0,0.1)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: 3,
        bottom: 0,
        background: accent,
        borderRadius: '14px 0 0 14px',
      }} />

      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: MUTED,
        letterSpacing: '0.07em',
        fontFamily: SANS,
        marginBottom: 14,
        textTransform: 'uppercase' as const,
      }}>
        {label}
      </div>

      <div style={{
        fontFamily: SANS,
        fontWeight: 800,
        fontSize: 44,
        color: TEXT,
        letterSpacing: '-0.03em',
        lineHeight: 1,
        marginBottom: 10,
      }}>
        {value.toLocaleString('pt-BR')}
      </div>

      <div style={{ fontSize: 13, color: MUTED, fontFamily: SANS }}>
        {sub}
      </div>

      {onClick && (
        <div style={{
          position: 'absolute',
          top: 22,
          right: 20,
          color: accent,
          fontSize: 16,
          opacity: 0.5,
          fontFamily: SANS,
        }}>
          →
        </div>
      )}
    </div>
  )
}

type AlertRowProps = {
  emoji: string
  title: string
  count: number
  accent: string
  accentBg: string
  accentText: string
  onClick: () => void
}

function AlertRow({ emoji, title, count, accent, accentBg, accentText, onClick }: AlertRowProps) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 18px',
        background: '#fff',
        borderRadius: 10,
        border: `1px solid ${BORDER}`,
        borderLeft: `3px solid ${accent}`,
        cursor: 'pointer',
        transition: 'box-shadow 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 4px 14px rgba(26,10,0,0.07)` }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 18 }}>{emoji}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: TEXT, fontFamily: SANS }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2, fontFamily: SANS }}>
            {count} aguardando aprovação
          </div>
        </div>
      </div>
      <span style={{
        padding: '4px 12px',
        borderRadius: 6,
        background: accentBg,
        color: accentText,
        fontSize: 12,
        fontWeight: 700,
        fontFamily: SANS,
        whiteSpace: 'nowrap' as const,
      }}>
        Revisar →
      </span>
    </div>
  )
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api.stats().then(setStats).catch(console.error).finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ maxWidth: 860 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontFamily: SANS,
          fontWeight: 800,
          fontSize: 24,
          color: TEXT,
          letterSpacing: '-0.02em',
          marginBottom: 4,
        }}>
          Dashboard
        </h1>
        <p style={{ color: MUTED, fontSize: 13.5, fontFamily: SANS }}>
          Visão geral da plataforma
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{
              height: 130,
              background: '#fff',
              borderRadius: 14,
              border: `1px solid ${BORDER}`,
              animation: 'fadeIn 0.3s ease',
            }} />
          ))}
        </div>
      ) : stats && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 14,
            marginBottom: 28,
          }}>
            <StatCard
              value={stats.totalUsers}
              label="Usuários"
              sub="Total de contas criadas"
              accent={O}
              onClick={() => navigate('/users')}
            />
            <StatCard
              value={stats.totalOrders}
              label="Pedidos"
              sub="Total de pedidos realizados"
              accent="#3B82F6"
            />
            <StatCard
              value={stats.pendingCouriers}
              label="Entregadores pendentes"
              sub="Aguardando análise de documentos"
              accent="#F59E0B"
              onClick={() => navigate('/couriers')}
            />
            <StatCard
              value={stats.pendingStores}
              label="Lojas pendentes"
              sub="Aguardando aprovação de cadastro"
              accent="#8B5CF6"
              onClick={() => navigate('/stores')}
            />
          </div>

          {(stats.pendingCouriers > 0 || stats.pendingStores > 0) && (
            <div>
              <h2 style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: 14,
                color: TEXT,
                letterSpacing: '-0.01em',
                marginBottom: 10,
              }}>
                Requer atenção
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                {stats.pendingCouriers > 0 && (
                  <AlertRow
                    emoji="🏍"
                    title="Entregadores aguardando aprovação"
                    count={stats.pendingCouriers}
                    accent="#F59E0B"
                    accentBg="#FEF3C7"
                    accentText="#92400E"
                    onClick={() => navigate('/couriers')}
                  />
                )}
                {stats.pendingStores > 0 && (
                  <AlertRow
                    emoji="🏪"
                    title="Lojas aguardando aprovação"
                    count={stats.pendingStores}
                    accent="#8B5CF6"
                    accentBg="#EDE9FE"
                    accentText="#5B21B6"
                    onClick={() => navigate('/stores')}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
