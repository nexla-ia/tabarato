import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import { api } from '../../src/api/client'

const PRIMARY       = '#FF5500'
const PRIMARY_LIGHT = '#FFF3EB'
const TEXT          = '#1A0A00'
const MUTED         = '#7A5C4A'
const BG            = '#FFFBF7'
const CARD          = '#FFFFFF'
const BORDER        = '#F0E8E0'
const GREEN         = '#22C55E'
const GREEN_LIGHT   = '#D1FAE5'

type Period = 'hoje' | 'semana' | 'mes' | 'tudo'

interface HistoryDelivery {
  id: string
  courierFee: number
  distanceKm: number
  deliveredAt: string | null
  createdAt: string
  order: {
    store: { name: string }
    address: { street: string; number: string; district: string; city: string }
  }
}

function startOf(period: Period): Date | null {
  const now = new Date()
  if (period === 'hoje') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }
  if (period === 'semana') {
    const d = new Date(now)
    d.setDate(d.getDate() - 6)
    d.setHours(0, 0, 0, 0)
    return d
  }
  if (period === 'mes') {
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }
  return null
}

function filterByPeriod(list: HistoryDelivery[], period: Period) {
  const from = startOf(period)
  if (!from) return list
  return list.filter(d => {
    const at = d.deliveredAt ?? d.createdAt
    return new Date(at) >= from
  })
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (dDay.getTime() === today.getTime()) return `Hoje às ${time}`
  if (dDay.getTime() === yesterday.getTime()) return `Ontem às ${time}`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ` às ${time}`
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'hoje',   label: 'Hoje' },
  { key: 'semana', label: '7 dias' },
  { key: 'mes',    label: 'Mês' },
  { key: 'tudo',   label: 'Tudo' },
]

export default function CourierHistoryScreen() {
  const insets = useSafeAreaInsets()
  const [history, setHistory]     = useState<HistoryDelivery[]>([])
  const [walletBalance, setWallet] = useState<number | null>(null)
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefresh]  = useState(false)
  const [period, setPeriod]       = useState<Period>('semana')
  const [error, setError]         = useState(false)

  const fetchHistory = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(false)
    try {
      const [{ data: hist }, { data: wallet }] = await Promise.all([
        api.get<HistoryDelivery[]>('/couriers/me/history'),
        api.get<{ balance: number }>('/couriers/me/wallet'),
      ])
      setHistory(hist)
      setWallet(wallet.balance)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
      setRefresh(false)
    }
  }, [])

  // Reload when tab is focused
  useFocusEffect(useCallback(() => { fetchHistory() }, [fetchHistory]))

  const filtered = filterByPeriod(history, period)

  const totalEarned   = filtered.reduce((s, d) => s + Number(d.courierFee), 0)
  const totalKm       = filtered.reduce((s, d) => s + Number(d.distanceKm), 0)
  const totalCount    = filtered.length

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={PRIMARY} size="large" />
      </View>
    )
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Histórico</Text>
        <Text style={styles.headerSub}>Suas entregas concluídas</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefresh(true); fetchHistory(true) }}
            tintColor={PRIMARY}
          />
        }
      >
        {/* Period filter */}
        <View style={styles.filterRow}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p.key}
              style={[styles.filterChip, period === p.key && styles.filterChipActive]}
              onPress={() => setPeriod(p.key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.filterChipText, period === p.key && styles.filterChipTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Wallet balance card */}
        <View style={styles.walletCard}>
          <View style={styles.walletLeft}>
            <View style={styles.walletIconWrap}>
              <Ionicons name="wallet-outline" size={20} color={GREEN} />
            </View>
            <View>
              <Text style={styles.walletLabel}>Saldo disponível</Text>
              <Text style={styles.walletValue}>
                {walletBalance !== null ? `R$ ${Number(walletBalance).toFixed(2)}` : '—'}
              </Text>
            </View>
          </View>
          <View style={styles.walletBadge}>
            <Ionicons name="arrow-down" size={11} color={GREEN} />
            <Text style={styles.walletBadgeText}>Ganhos acumulados</Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderColor: GREEN_LIGHT }]}>
            <View style={[styles.statIcon, { backgroundColor: GREEN_LIGHT }]}>
              <Ionicons name="cash-outline" size={18} color={GREEN} />
            </View>
            <Text style={[styles.statValue, { color: GREEN }]}>
              R$ {totalEarned.toFixed(2)}
            </Text>
            <Text style={styles.statLabel}>No período</Text>
          </View>

          <View style={[styles.statCard, { borderColor: PRIMARY_LIGHT }]}>
            <View style={[styles.statIcon, { backgroundColor: PRIMARY_LIGHT }]}>
              <Ionicons name="bicycle-outline" size={18} color={PRIMARY} />
            </View>
            <Text style={[styles.statValue, { color: PRIMARY }]}>{totalCount}</Text>
            <Text style={styles.statLabel}>Entregas</Text>
          </View>

          <View style={[styles.statCard, { borderColor: '#EDE9FE' }]}>
            <View style={[styles.statIcon, { backgroundColor: '#EDE9FE' }]}>
              <Ionicons name="map-outline" size={18} color="#7C3AED" />
            </View>
            <Text style={[styles.statValue, { color: '#7C3AED' }]}>{totalKm.toFixed(0)} km</Text>
            <Text style={styles.statLabel}>Percorridos</Text>
          </View>
        </View>

        {/* Error */}
        {error && (
          <View style={styles.errorCard}>
            <Ionicons name="cloud-offline-outline" size={20} color={MUTED} />
            <Text style={styles.errorText}>Não foi possível carregar. Puxe para atualizar.</Text>
          </View>
        )}

        {/* List */}
        {!error && filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="bicycle-outline" size={40} color={PRIMARY} />
            </View>
            <Text style={styles.emptyTitle}>
              {period === 'hoje' ? 'Nenhuma entrega hoje' :
               period === 'semana' ? 'Nenhuma entrega nos últimos 7 dias' :
               period === 'mes' ? 'Nenhuma entrega este mês' :
               'Nenhuma entrega ainda'}
            </Text>
            <Text style={styles.emptySub}>
              {history.length > 0
                ? 'Tente selecionar um período maior'
                : 'Suas entregas concluídas aparecerão aqui'}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.listLabel}>
              {totalCount} entrega{totalCount !== 1 ? 's' : ''}
            </Text>
            {filtered.map((d, idx) => (
              <DeliveryHistoryCard key={d.id} delivery={d} isFirst={idx === 0} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  )
}

function DeliveryHistoryCard({
  delivery: d,
  isFirst,
}: {
  delivery: HistoryDelivery
  isFirst: boolean
}) {
  const dateStr = fmtDate(d.deliveredAt)
  const isToday = dateStr.startsWith('Hoje')

  return (
    <View style={[styles.deliveryCard, isFirst && { marginTop: 0 }]}>
      {/* Left accent */}
      <View style={styles.cardAccent} />

      <View style={styles.cardBody}>
        {/* Top row */}
        <View style={styles.cardTop}>
          <View style={styles.storeIconWrap}>
            <Ionicons name="storefront-outline" size={15} color={PRIMARY} />
          </View>
          <Text style={styles.storeName} numberOfLines={1}>{d.order.store.name}</Text>
          <View style={[styles.feeBadge, isToday && styles.feeBadgeToday]}>
            <Text style={[styles.feeText, isToday && styles.feeTextToday]}>
              + R$ {Number(d.courierFee).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Address */}
        <View style={styles.addrRow}>
          <Ionicons name="location-outline" size={12} color={MUTED} />
          <Text style={styles.addrText} numberOfLines={1}>
            {d.order.address.street}, {d.order.address.number} — {d.order.address.district}
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.cardFooter}>
          <View style={styles.footerChip}>
            <Ionicons name="map-outline" size={11} color={MUTED} />
            <Text style={styles.footerChipText}>{Number(d.distanceKm).toFixed(1)} km</Text>
          </View>
          <View style={styles.footerDot} />
          <View style={styles.footerChip}>
            <Ionicons name="checkmark-circle" size={11} color={GREEN} />
            <Text style={[styles.footerChipText, { color: GREEN }]}>Entregue</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Text style={[styles.dateText, isToday && { color: PRIMARY, fontWeight: '700' }]}>
            {dateStr}
          </Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 0 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: TEXT, letterSpacing: -0.4 },
  headerSub: { fontSize: 12, color: MUTED, marginTop: 2, fontWeight: '500' },

  filterRow: {
    flexDirection: 'row', gap: 8,
    paddingVertical: 16,
  },
  filterChip: {
    flex: 1, paddingVertical: 8, borderRadius: 12,
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER,
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: PRIMARY, borderColor: PRIMARY,
  },
  filterChipText: { fontSize: 12, fontWeight: '700', color: MUTED },
  filterChipTextActive: { color: '#fff' },

  walletCard: {
    backgroundColor: '#F0FDF4', borderRadius: 18, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: '#BBF7D0', marginBottom: 12,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  walletLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  walletIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: GREEN_LIGHT, alignItems: 'center', justifyContent: 'center',
  },
  walletLabel: { fontSize: 11, fontWeight: '600', color: '#166534', marginBottom: 2 },
  walletValue: { fontSize: 22, fontWeight: '900', color: '#15803D', letterSpacing: -0.5 },
  walletBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: GREEN_LIGHT, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 10, borderWidth: 1, borderColor: '#BBF7D0',
  },
  walletBadgeText: { fontSize: 10, fontWeight: '700', color: GREEN },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: CARD, borderRadius: 16, padding: 14,
    alignItems: 'center', gap: 6, borderWidth: 1.5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 16, fontWeight: '900' },
  statLabel: { fontSize: 10, color: MUTED, fontWeight: '600' },

  errorCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF8F3', borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: BORDER,
    marginBottom: 16,
  },
  errorText: { flex: 1, fontSize: 13, color: MUTED, lineHeight: 18 },

  emptyCard: {
    backgroundColor: CARD, borderRadius: 20, padding: 32,
    alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: BORDER,
    marginTop: 8,
  },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: PRIMARY_LIGHT,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: TEXT, textAlign: 'center' },
  emptySub:   { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 19 },

  listLabel: {
    fontSize: 11, fontWeight: '700', color: MUTED,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 10,
  },

  deliveryCard: {
    backgroundColor: CARD, borderRadius: 14, marginBottom: 10,
    flexDirection: 'row', overflow: 'hidden',
    borderWidth: 1, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  cardAccent: { width: 4, backgroundColor: GREEN },
  cardBody: { flex: 1, padding: 13, gap: 6 },

  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  storeIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: PRIMARY_LIGHT, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  storeName: { flex: 1, fontSize: 14, fontWeight: '800', color: TEXT },
  feeBadge: {
    backgroundColor: GREEN_LIGHT, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  feeBadgeToday: { backgroundColor: PRIMARY_LIGHT },
  feeText: { fontSize: 13, fontWeight: '800', color: GREEN },
  feeTextToday: { color: PRIMARY },

  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addrText: { flex: 1, fontSize: 12, color: MUTED, lineHeight: 16 },

  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  footerChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  footerChipText: { fontSize: 11, color: MUTED, fontWeight: '600' },
  footerDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: BORDER },
  dateText: { fontSize: 11, color: MUTED, fontWeight: '500' },
})
