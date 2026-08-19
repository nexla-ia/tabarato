'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, TrendingUp, Receipt, Percent, Package2, BarChart3 } from 'lucide-react'
import { api } from '@/lib/api'
import { money } from '@/lib/types'
import { Spinner } from '@/components/Spinner'
import styles from './page.module.css'

interface SalesDay { date: string; revenue: number; count: number }
interface TopProduct { name: string; qty: number }
interface Analytics {
  totalOrders: number
  deliveredOrders: number
  cancelledOrders: number
  totalRevenue: number
  avgTicket: number
  cancellationRate: number
  activeProducts: number
  salesByDay: SalesDay[]
  topProducts: TopProduct[]
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
}

export default function AnalyticsPage() {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(false)

  const analyticsQ = useQuery<Analytics>({
    queryKey: ['store-analytics'],
    queryFn: async () => (await api.get('/stores/my/analytics')).data,
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

  if (analyticsQ.isLoading) return <Spinner />

  const a = analyticsQ.data
  const maxRevenue = Math.max(1, ...(a?.salesByDay ?? []).map(d => d.revenue))

  return (
    <div className={styles.wrap}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Analytics</h1>
          <p className={styles.subtitle}>Desempenho da sua loja nos últimos 7 dias</p>
        </div>
        <button className={styles.exportBtn} onClick={handleExport} disabled={exporting}>
          <Download size={15} /> {exporting ? 'Exportando...' : 'Exportar pedidos (CSV)'}
        </button>
      </div>
      {exportError && <p style={{ color: '#DC2626', fontSize: 13, marginTop: -14, marginBottom: 16 }}>Não foi possível exportar os pedidos. Tente novamente.</p>}

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}><TrendingUp size={13} /> Faturamento (7d)</div>
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
        <div className={styles.cardTitle}><BarChart3 size={16} style={{ verticalAlign: -2, marginRight: 6 }} />Vendas por dia</div>
        {(a?.salesByDay ?? []).every(d => d.count === 0) ? (
          <div className={styles.empty}>Nenhuma venda entregue nos últimos 7 dias.</div>
        ) : (
          <div className={styles.chart}>
            {(a?.salesByDay ?? []).map((d) => (
              <div key={d.date} className={styles.chartCol}>
                <span className={styles.chartValue}>{d.count > 0 ? money(d.revenue) : ''}</span>
                <div className={styles.chartBarWrap}>
                  <div
                    className={styles.chartBar}
                    style={{ height: `${Math.max(3, (d.revenue / maxRevenue) * 100)}%` }}
                    title={`${money(d.revenue)} · ${d.count} pedido(s)`}
                  />
                </div>
                <span className={styles.chartLabel}>{dayLabel(d.date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>Mais vendidos</div>
        {(a?.topProducts ?? []).length === 0 ? (
          <div className={styles.empty}>Nenhum produto vendido ainda nos últimos 7 dias.</div>
        ) : (
          <div className={styles.topList}>
            {a!.topProducts.map((p, i) => (
              <div key={p.name + i} className={styles.topRow}>
                <span className={styles.topRank}>{i + 1}</span>
                <span className={styles.topName}>{p.name}</span>
                <span className={styles.topQty}>{p.qty} vendido{p.qty === 1 ? '' : 's'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
