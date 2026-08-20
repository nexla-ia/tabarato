'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, TrendingUp, Receipt, Percent, Package2, BarChart3, PieChart } from 'lucide-react'
import { api } from '@/lib/api'
import { money } from '@/lib/types'
import { Spinner } from '@/components/Spinner'
import styles from './page.module.css'

type Period = 'day' | 'week' | 'month'
const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Hoje' },
  { value: 'week', label: '7 dias' },
  { value: 'month', label: '30 dias' },
]
const PERIOD_SUB: Record<Period, string> = {
  day: 'de hoje', week: 'dos últimos 7 dias', month: 'dos últimos 30 dias',
}
const CAT_COLORS = ['#FF6600', '#2563EB', '#059669', '#7C3AED', '#DB2777', '#D97706']

interface SeriesPoint { label: string; revenue: number; count: number }
interface TopProduct { name: string; qty: number; revenue?: number }
interface CategorySales { name: string; revenue: number; qty: number }
interface Analytics {
  period?: Period
  totalOrders: number
  deliveredOrders: number
  cancelledOrders: number
  totalRevenue: number
  avgTicket: number
  cancellationRate: number
  activeProducts: number
  salesByDay: SeriesPoint[]
  series?: SeriesPoint[]
  salesByCategory?: CategorySales[]
  topProducts: TopProduct[]
}

// label pode ser "YYYY-MM-DD" (semana/mês) ou já "08h" (dia).
function pointLabel(label: string, period: Period) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const d = new Date(label + 'T12:00:00')
    return period === 'month'
      ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      : d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  }
  return label
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('week')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)

  const analyticsQ = useQuery<Analytics>({
    queryKey: ['store-analytics', period],
    queryFn: async () => (await api.get('/stores/my/analytics', { params: { period } })).data,
  })

  async function handleExport() {
    setExporting(true); setExportError(false)
    try {
      const res = await api.get('/stores/my/orders/export', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'pedidos.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setExportError(true)
    } finally {
      setExporting(false)
    }
  }

  const a = analyticsQ.data
  const series = a?.series ?? a?.salesByDay ?? []
  const maxRevenue = Math.max(1, ...series.map(d => d.revenue))
  const cats = a?.salesByCategory ?? []
  const catTotal = cats.reduce((s, c) => s + c.revenue, 0)

  return (
    <div className={styles.wrap}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Analytics</h1>
          <p className={styles.subtitle}>Desempenho da sua loja {PERIOD_SUB[period]}</p>
        </div>
        <button className={styles.exportBtn} onClick={handleExport} disabled={exporting}>
          <Download size={15} /> {exporting ? 'Exportando...' : 'Exportar pedidos (CSV)'}
        </button>
      </div>
      {exportError && <p style={{ color: '#DC2626', fontSize: 13, marginTop: -14, marginBottom: 16 }}>Não foi possível exportar os pedidos. Tente novamente.</p>}

      {/* Seletor de período */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {PERIODS.map(p => {
          const active = period === p.value
          return (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              style={{
                padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: active ? '1.5px solid var(--primary, #FF6600)' : '1.5px solid var(--border, #e5e5e5)',
                background: active ? 'var(--primary, #FF6600)' : 'transparent',
                color: active ? '#fff' : 'var(--muted, #777)',
              }}
            >{p.label}</button>
          )
        })}
      </div>

      {analyticsQ.isLoading ? <Spinner /> : (
        <>
      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}><TrendingUp size={13} /> Faturamento</div>
          <div className={styles.statValue}>{money(a?.totalRevenue ?? 0)}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}><Receipt size={13} /> Ticket médio</div>
          <div className={styles.statValue}>{money(a?.avgTicket ?? 0)}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}><Percent size={13} /> Cancelamento</div>
          <div className={styles.statValue}>{(a?.cancellationRate ?? 0).toLocaleString('pt-BR')}%</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}><Package2 size={13} /> Produtos ativos</div>
          <div className={styles.statValue}>{a?.activeProducts ?? 0}</div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>
          <BarChart3 size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
          Receita por {period === 'day' ? 'hora' : 'dia'}
        </div>
        {series.every(d => d.count === 0) ? (
          <div className={styles.empty}>Nenhuma venda entregue no período.</div>
        ) : (
          <div className={styles.chart} style={{ overflowX: 'auto' }}>
            {series.map((d, i) => (
              <div key={d.label + i} className={styles.chartCol} style={period !== 'week' ? { minWidth: 34 } : undefined}>
                <span className={styles.chartValue}>{d.revenue > 0 ? money(d.revenue) : ''}</span>
                <div className={styles.chartBarWrap}>
                  <div
                    className={styles.chartBar}
                    style={{ height: `${Math.max(3, (d.revenue / maxRevenue) * 100)}%` }}
                    title={`${money(d.revenue)} · ${d.count} pedido(s)`}
                  />
                </div>
                <span className={styles.chartLabel}>{pointLabel(d.label, period)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vendas por categoria */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>
          <PieChart size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
          Vendas por categoria
        </div>
        {cats.length === 0 ? (
          <div className={styles.empty}>Nenhuma venda entregue no período.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {cats.map((c, i) => {
              const pct = catTotal > 0 ? (c.revenue / catTotal) * 100 : 0
              const color = CAT_COLORS[i % CAT_COLORS.length]
              return (
                <div key={c.name + i}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{c.name}</span>
                    <span style={{ fontSize: 14, fontWeight: 800 }}>{money(c.revenue)}</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--border, #f0ebe5)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(pct, 2)}%`, height: 8, background: color, borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted, #999)', marginTop: 3 }}>{pct.toFixed(0)}% · {c.qty} un.</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Mais vendidos</div>
        {(a?.topProducts ?? []).length === 0 ? (
          <div className={styles.empty}>Nenhum produto vendido no período.</div>
        ) : (
          <div className={styles.topList}>
            {a!.topProducts.map((p, i) => (
              <div key={p.name + i} className={styles.topRow}>
                <span className={styles.topRank}>{i + 1}</span>
                <span className={styles.topName}>{p.name}</span>
                <span className={styles.topQty}>
                  {p.qty} vendido{p.qty === 1 ? '' : 's'}{p.revenue != null ? ` · ${money(p.revenue)}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  )
}
