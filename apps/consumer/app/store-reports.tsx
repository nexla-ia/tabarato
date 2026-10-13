import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { api } from '../src/api/client'
import { colors } from '../src/theme/colors'
import { LoadError } from '../src/components/LoadError'

type Period = 'day' | 'week' | 'month'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Hoje' },
  { value: 'week', label: '7 dias' },
  { value: 'month', label: '30 dias' },
]

// Paleta pras barras de categoria (repete se passar de 6).
const CAT_COLORS = ['#FF6600', '#2563EB', '#059669', '#7C3AED', '#DB2777', '#D97706']

function brl(n: number, decimals = 0): string {
  return 'R$ ' + Number(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

interface Analytics {
  period: Period
  totalOrders: number
  deliveredOrders: number
  cancelledOrders: number
  totalRevenue: number
  avgTicket: number
  cancellationRate: number
  activeProducts: number
  series: { label: string; revenue: number; count: number }[]
  salesByCategory: { name: string; revenue: number; qty: number }[]
  topProducts: { name: string; qty: number; revenue: number }[]
}

export default function StoreReports() {
  const insets = useSafeAreaInsets()
  const [period, setPeriod] = useState<Period>('week')
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async (p: Period, silent = false) => {
    if (!silent) setLoading(true)
    try {
      const { data } = await api.get<Analytics>('/stores/my/analytics', { params: { period: p } })
      setData(data)
    } catch {} finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchData(period) }, [period, fetchData])

  const maxRev = data?.series?.length ? Math.max(...data.series.map(s => s.revenue), 1) : 1
  const catTotal = data?.salesByCategory?.reduce((s, c) => s + c.revenue, 0) ?? 0
  // Pra 'day' mostramos 24 barras finas; senão as barras do período.
  const barMinWidth = period === 'day' ? 18 : period === 'month' ? 20 : 40

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F5F5' }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Relatórios</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Seletor de período */}
      <View style={styles.periodBar}>
        {PERIODS.map(p => (
          <TouchableOpacity
            key={p.value}
            style={[styles.periodBtn, period === p.value && styles.periodBtnActive]}
            onPress={() => setPeriod(p.value)}
            activeOpacity={0.85}
          >
            <Text style={[styles.periodText, period === p.value && styles.periodTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : !data ? (
        <LoadError
          onRetry={() => fetchData(period)}
          sub="Não conseguimos buscar o relatório. Verifique a conexão."
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(period, true) }} colors={[colors.primary]} tintColor={colors.primary} />
          }
        >
          {/* KPIs */}
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <Ionicons name="cash-outline" size={18} color="#059669" />
              <Text style={styles.kpiValue}>{brl(data.totalRevenue)}</Text>
              <Text style={styles.kpiLabel}>Receita (líquida)</Text>
            </View>
            <View style={styles.kpiCard}>
              <Ionicons name="checkmark-done-outline" size={18} color="#2563EB" />
              <Text style={styles.kpiValue}>{data.deliveredOrders}</Text>
              <Text style={styles.kpiLabel}>Pedidos entregues</Text>
            </View>
            <View style={styles.kpiCard}>
              <Ionicons name="pricetag-outline" size={18} color="#7C3AED" />
              <Text style={styles.kpiValue}>{brl(data.avgTicket)}</Text>
              <Text style={styles.kpiLabel}>Ticket médio</Text>
            </View>
            <View style={styles.kpiCard}>
              <Ionicons name="close-circle-outline" size={18} color={data.cancellationRate > 20 ? '#DC2626' : '#D97706'} />
              <Text style={[styles.kpiValue, data.cancellationRate > 20 && { color: '#DC2626' }]}>{data.cancellationRate.toFixed(0)}%</Text>
              <Text style={styles.kpiLabel}>Cancelamentos</Text>
            </View>
          </View>

          {/* Gráfico de receita */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Receita por {period === 'day' ? 'hora' : 'dia'}</Text>
            {data.totalRevenue === 0 ? (
              <View style={styles.chartEmpty}>
                <Ionicons name="bar-chart-outline" size={26} color="#C0B0A8" />
                <Text style={styles.emptyText}>Sem vendas no período</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingTop: 8 }}>
                <View style={styles.chartWrap}>
                  {data.series.map((s, i) => {
                    const barH = Math.max((s.revenue / maxRev) * 90, s.revenue > 0 ? 4 : 2)
                    const dayLabel = period === 'day'
                      ? s.label
                      : new Date(s.label + 'T12:00:00').toLocaleDateString('pt-BR', period === 'month' ? { day: '2-digit', month: '2-digit' } : { weekday: 'short' })
                    return (
                      <View key={i} style={[styles.chartCol, { width: barMinWidth }]}>
                        <Text style={styles.chartVal}>{s.revenue > 0 ? brl(s.revenue) : ''}</Text>
                        <View style={[styles.chartBar, { height: barH, backgroundColor: s.revenue > 0 ? colors.primary : '#EDE5DF' }]} />
                        <Text style={styles.chartLabel} numberOfLines={1}>{dayLabel}</Text>
                      </View>
                    )
                  })}
                </View>
              </ScrollView>
            )}
          </View>

          {/* Vendas por categoria */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Vendas por categoria</Text>
            {data.salesByCategory.length === 0 ? (
              <View style={styles.chartEmpty}>
                <Ionicons name="pie-chart-outline" size={26} color="#C0B0A8" />
                <Text style={styles.emptyText}>Sem vendas no período</Text>
              </View>
            ) : (
              data.salesByCategory.map((c, i) => {
                const pct = catTotal > 0 ? (c.revenue / catTotal) * 100 : 0
                const color = CAT_COLORS[i % CAT_COLORS.length]
                return (
                  <View key={i} style={styles.catRow}>
                    <View style={styles.catTop}>
                      <View style={[styles.catDot, { backgroundColor: color }]} />
                      <Text style={styles.catName} numberOfLines={1}>{c.name}</Text>
                      <Text style={styles.catRev}>{brl(c.revenue)}</Text>
                    </View>
                    <View style={styles.catBarTrack}>
                      <View style={[styles.catBarFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: color }]} />
                    </View>
                    <Text style={styles.catMeta}>{pct.toFixed(0)}% · {c.qty} un.</Text>
                  </View>
                )
              })
            )}
          </View>

          {/* Top produtos */}
          {data.topProducts.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Top produtos</Text>
              {data.topProducts.map((p, i) => (
                <View key={i} style={[styles.topRow, i < data.topProducts.length - 1 && styles.topRowBorder]}>
                  <View style={styles.topRank}><Text style={styles.topRankText}>{i + 1}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.topName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.topMeta}>{brl(p.revenue)}</Text>
                  </View>
                  <Text style={styles.topQty}>{p.qty} un.</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.footNote}>Receita líquida = 90% do subtotal (após taxa da plataforma). Considera apenas pedidos entregues.</Text>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: { width: 22 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },

  periodBar: {
    flexDirection: 'row', gap: 6,
    backgroundColor: colors.primary, paddingHorizontal: 16, paddingBottom: 14,
  },
  periodBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  periodBtnActive: { backgroundColor: '#fff' },
  periodText: { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.9)' },
  periodTextActive: { color: colors.primary },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { fontSize: 13, color: '#9A8880', fontWeight: '600', marginTop: 8 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  kpiCard: {
    width: '47.5%', backgroundColor: '#fff', borderRadius: 16, padding: 14, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  kpiValue: { fontSize: 20, fontWeight: '900', color: '#1A0A00', letterSpacing: -0.5, marginTop: 4 },
  kpiLabel: { fontSize: 11.5, color: '#9A8880', fontWeight: '600' },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#1A0A00', marginBottom: 8 },

  chartEmpty: { alignItems: 'center', paddingVertical: 24, gap: 4 },
  chartWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 130 },
  chartCol: { alignItems: 'center', gap: 4, justifyContent: 'flex-end' },
  chartBar: { width: '72%', borderRadius: 4, minHeight: 2 },
  chartLabel: { fontSize: 9, color: '#9A8880', fontWeight: '600' },
  chartVal: { fontSize: 8, color: colors.primary, fontWeight: '700', textAlign: 'center' },

  catRow: { marginBottom: 14 },
  catTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catName: { flex: 1, fontSize: 13.5, fontWeight: '700', color: '#1A0A00' },
  catRev: { fontSize: 13.5, fontWeight: '900', color: '#1A0A00' },
  catBarTrack: { height: 8, backgroundColor: '#F0EBE5', borderRadius: 4, overflow: 'hidden' },
  catBarFill: { height: 8, borderRadius: 4 },
  catMeta: { fontSize: 11, color: '#9A8880', fontWeight: '600', marginTop: 4 },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  topRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F0EBE5' },
  topRank: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  topRankText: { fontSize: 11, fontWeight: '900', color: '#fff' },
  topName: { fontSize: 13, fontWeight: '700', color: '#1A0A00' },
  topMeta: { fontSize: 11.5, color: '#9A8880', fontWeight: '600', marginTop: 1 },
  topQty: { fontSize: 12.5, color: '#1A0A00', fontWeight: '800' },

  footNote: { fontSize: 11, color: '#B0A098', marginTop: 16, lineHeight: 15, textAlign: 'center' },
})
