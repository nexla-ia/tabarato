import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, ActivityIndicator, RefreshControl, Animated, Image, Alert, Linking } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { useAuthStore } from '../../src/stores/auth.store'
import { useLojistaStore } from '../../src/stores/lojista.store'
import { api } from '../../src/api/client'
import { colors } from '../../src/theme/colors'
import { useToast } from '../../src/components/Toast'
import { STORE_TERMS_URL, STORE_TERMS_VERSION } from '../../src/links'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']
type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED'

interface RecentOrder {
  id: string
  client: string
  items: string
  total: number
  time: string
  status: OrderStatus
}

const STATUS_MAP: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  PENDING:   { label: 'Pendente',   color: '#D97706', bg: '#FEF3C7' },
  CONFIRMED: { label: 'Confirmado', color: '#2563EB', bg: '#DBEAFE' },
  PREPARING: { label: 'Preparando', color: '#7C3AED', bg: '#EDE9FE' },
  READY:     { label: 'Pronto',     color: '#059669', bg: '#D1FAE5' },
  DELIVERED: { label: 'Entregue',   color: '#16A34A', bg: '#DCFCE7' },
  CANCELLED: { label: 'Cancelado',  color: '#DC2626', bg: '#FEE2E2' },
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (diff < 1) return 'agora'
  if (diff < 60) return `${diff} min`
  const h = Math.floor(diff / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function shortId(id: string): string {
  return '#' + id.slice(-6).toUpperCase()
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function startOfToday(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function startOfYesterday(): Date {
  const t = startOfToday()
  return new Date(t.getTime() - 86_400_000)
}

export default function StoreDashboard() {
  const insets = useSafeAreaInsets()
  const { show: toast } = useToast()
  const { user } = useAuthStore()
  const setPendingCount = useLojistaStore((s) => s.setPendingCount)

  const [isOpen, setIsOpen] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [togglingOpen, setTogglingOpen] = useState(false)
  const [togglingPause, setTogglingPause] = useState(false)
  const [pauseToast, setPauseToast] = useState<string | null>(null)
  const pauseToastY = useRef(new Animated.Value(-60)).current
  const [orders, setOrders] = useState<any[]>([])
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [loadingStore, setLoadingStore] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [avgRating, setAvgRating] = useState<number | null>(null)
  const [reviewCount, setReviewCount] = useState(0)
  const [loadingReviews, setLoadingReviews] = useState(true)
  const [analytics, setAnalytics] = useState<any | null>(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(true)
  // Mercado Pago: enabled = marketplace ligado; connected = loja conectou a conta.
  // Sem conexão a loja não pode abrir (não recebe pagamento).
  const [mp, setMp] = useState<{ enabled: boolean; connected: boolean }>({ enabled: false, connected: false })
  // Aceite dos Termos do Lojista: null = loja criada antes de registrarmos aceite;
  // versão diferente da atual = o texto mudou desde que ela aceitou.
  const [termsPending, setTermsPending] = useState(false)
  const [acceptingTerms, setAcceptingTerms] = useState(false)

  const nameParts = user?.name?.split(' ') ?? []
  const firstName = nameParts[0] ?? 'Lojista'

  const fetchStoreData = useCallback(async (): Promise<string | null> => {
    try {
      const { data } = await api.get('/stores/my')
      setIsOpen(data.isOpen ?? false)
      setStoreId(data.id)
      setLogoUrl(data.logoUrl ?? null)
      // Loja "nova" (recém-aprovada) = sem logo e sem fotos → sugere configurar.
      setNeedsSetup(!data.logoUrl && !(data.photos?.length))
      setTermsPending(!data.termsAcceptedAt || data.termsVersion !== STORE_TERMS_VERSION)
      return data.id as string
    } catch {
      return null
    } finally {
      setLoadingStore(false)
    }
  }, [])

  const acceptTerms = useCallback(async () => {
    setAcceptingTerms(true)
    try {
      await api.post('/stores/my/accept-terms', { version: STORE_TERMS_VERSION })
      setTermsPending(false)
      toast('Aceite registrado. Obrigado!', 'success')
    } catch {
      toast('Não foi possível registrar o aceite agora. Tente novamente.', 'error')
    } finally {
      setAcceptingTerms(false)
    }
  }, [toast])

  const fetchReviews = useCallback(async (sid: string) => {
    setLoadingReviews(true)
    try {
      const { data } = await api.get(`/reviews/store/${sid}?limit=1`)
      setAvgRating(data.avgRating ?? null)
      setReviewCount(data.total ?? 0)
    } catch {} finally {
      setLoadingReviews(false)
    }
  }, [])

  const fetchAnalytics = useCallback(async () => {
    try {
      const { data } = await api.get('/stores/my/analytics')
      setAnalytics(data)
    } catch {} finally {
      setLoadingAnalytics(false)
    }
  }, [])

  const fetchMpStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/stores/mp/status')
      setMp({ enabled: !!data.enabled, connected: !!data.connected })
    } catch {}
  }, [])

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoadingOrders(true)
    try {
      const { data } = await api.get('/orders/store')
      setOrders(data)
      const pending = data.filter((o: any) => o.status === 'PENDING').length
      setPendingCount(pending)
    } catch {
      // silently fail
    } finally {
      setLoadingOrders(false)
      setRefreshing(false)
    }
  }, [setPendingCount])

  useEffect(() => {
    async function init() {
      const sid = await fetchStoreData()
      if (sid) fetchReviews(sid)
    }
    init()
    fetchOrders()
    fetchAnalytics()
    fetchMpStatus()
    const interval = setInterval(() => fetchOrders(true), 30_000)
    return () => clearInterval(interval)
  }, [fetchStoreData, fetchOrders, fetchReviews, fetchAnalytics, fetchMpStatus])

  // Recarrega os dados da loja ao voltar pra esta tela (ex.: depois de editar
  // logo/fotos na config) — mantém o avatar e o card de boas-vindas em dia.
  useFocusEffect(
    useCallback(() => { fetchStoreData(); fetchMpStatus() }, [fetchStoreData, fetchMpStatus])
  )

  async function handleToggleOpen() {
    // Trava: não deixa ABRIR a loja sem Mercado Pago conectado (sem isso ela não
    // recebe pagamento e o pedido seria barrado no checkout do cliente).
    if (!isOpen && mp.enabled && !mp.connected) {
      Alert.alert(
        'Conecte o Mercado Pago',
        'Para abrir a loja e receber pedidos, conecte sua conta Mercado Pago em Configurações. Lembre de ter uma chave PIX cadastrada na conta para receber por PIX.',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Configurar', onPress: () => router.push('/(store-tabs)/store') },
        ],
      )
      return
    }
    setTogglingOpen(true)
    try {
      const { data } = await api.patch('/stores/my/toggle-open')
      setIsOpen(data.isOpen)
      if (data.isOpen) setIsPaused(false) // opening clears pause
    } catch (e: any) {
      toast(e?.response?.data?.message ?? 'Tente novamente.', 'error')
    } finally {
      setTogglingOpen(false)
    }
  }

  function showPauseToast(msg: string) {
    setPauseToast(msg)
    Animated.sequence([
      Animated.timing(pauseToastY, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(pauseToastY, { toValue: -60, duration: 250, useNativeDriver: true }),
    ]).start(() => setPauseToast(null))
  }

  async function handleTogglePause() {
    setTogglingPause(true)
    try {
      const { data } = await api.patch('/stores/my/toggle-pause')
      setIsPaused(data.isPaused)
      if (data.isPaused) setIsOpen(false)
      showPauseToast(data.isPaused ? '⏸ Loja pausada temporariamente' : '▶ Loja retomada')
    } catch {} finally {
      setTogglingPause(false)
    }
  }

  async function onRefresh() {
    setRefreshing(true)
    const sid = await fetchStoreData()
    await Promise.all([
      fetchOrders(),
      sid ? fetchReviews(sid) : Promise.resolve(),
    ])
    setRefreshing(false)
  }

  // ── Computed stats ──────────────────────────────────
  const todayStart = startOfToday()
  const yesterdayStart = startOfYesterday()

  const todayOrders = orders.filter((o) => new Date(o.createdAt) >= todayStart)
  const yesterdayOrders = orders.filter((o) => {
    const d = new Date(o.createdAt)
    return d >= yesterdayStart && d < todayStart
  })

  // Receita só conta pedido PAGO e NÃO cancelado. Pedido cancelado (ou PIX ainda
  // não pago) não é dinheiro que entrou — não deve aparecer na "Receita hoje".
  const countsAsRevenue = (o: any) => o.status !== 'CANCELLED' && o.payment?.status === 'PAID'
  const sumRevenue = (list: any[]) => list.filter(countsAsRevenue).reduce((s, o) => s + Number(o.total ?? 0), 0)

  const todayCount = todayOrders.length
  const todayRevenue = sumRevenue(todayOrders)
  const pendingCount = orders.filter((o) => o.status === 'PENDING').length
  const countDiff = todayCount - yesterdayOrders.length
  const revenueDiff = todayRevenue - sumRevenue(yesterdayOrders)

  const recentOrders: RecentOrder[] = orders.slice(0, 4).map((o) => ({
    id: o.id,
    client: o.user?.name ?? 'Cliente',
    items: (o.items ?? []).map((i: any) => i.product?.name ?? '').filter(Boolean).join(', ') || '—',
    total: o.total,
    time: timeAgo(o.createdAt),
    status: o.status,
  }))

  interface StatCard {
    label: string
    value: string
    icon: IoniconName
    trend?: string
    trendUp?: boolean
    color: string
    loading?: boolean
  }

  const stats: StatCard[] = [
    {
      label: 'Pedidos hoje',
      value: String(todayCount),
      icon: 'receipt-outline',
      trend: countDiff !== 0 ? `${countDiff > 0 ? '+' : ''}${countDiff} vs ontem` : undefined,
      trendUp: countDiff > 0,
      color: '#2563EB',
    },
    {
      label: 'Receita hoje',
      value: `R$ ${todayRevenue.toFixed(0)}`,
      icon: 'cash-outline',
      trend: revenueDiff !== 0 ? `${revenueDiff > 0 ? '+' : ''}R$ ${Math.abs(revenueDiff).toFixed(0)}` : undefined,
      trendUp: revenueDiff > 0,
      color: '#059669',
    },
    {
      label: 'Pendentes',
      value: String(pendingCount),
      icon: 'time-outline',
      color: '#D97706',
    },
    {
      label: 'Avaliação',
      value: avgRating != null ? avgRating.toFixed(1) : '—',
      icon: avgRating != null ? 'star' : 'star-outline',
      color: '#F59E0B',
      trend: reviewCount > 0
        ? `${reviewCount} avaliação${reviewCount !== 1 ? 'ões' : ''}`
        : undefined,
      loading: loadingReviews,
    },
  ]

  return (
    <View style={{ flex: 1 }}>
      {/* Pause toast */}
      {pauseToast && (
        <Animated.View style={[styles.pauseToast, { transform: [{ translateY: pauseToastY }] }]}>
          <Text style={styles.pauseToastText}>{pauseToast}</Text>
        </Animated.View>
      )}
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} />
      }
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerDecor1} />
        <View style={styles.headerDecor2} />

        <View style={styles.topRow}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}, {firstName}</Text>
            <Text style={styles.date}>
              {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
          </View>
          <TouchableOpacity style={styles.avatarBtn} onPress={() => router.push('/(store-tabs)/store')} activeOpacity={0.8}>
            {logoUrl
              ? <Image source={{ uri: logoUrl }} style={styles.avatarImg} />
              : <Text style={styles.avatarText}>{firstName[0]?.toUpperCase()}</Text>}
          </TouchableOpacity>
        </View>

        {/* Status da loja */}
        <View style={styles.storeStatusCard}>
          <View style={styles.storeStatusLeft}>
            <View style={[styles.statusDot, { backgroundColor: isPaused ? '#F59E0B' : isOpen ? '#4ADE80' : '#EF4444' }]} />
            <View>
              <Text style={styles.storeStatusLabel}>Loja está</Text>
              <Text style={styles.storeStatusValue}>
                {isPaused ? 'Pausada temporariamente' : isOpen ? 'Aberta para pedidos' : 'Fechada'}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {/* Pause button */}
            {isOpen && (
              togglingPause
                ? <ActivityIndicator color="#fff" size="small" />
                : (
                  <TouchableOpacity
                    onPress={handleTogglePause}
                    activeOpacity={0.8}
                    style={{
                      backgroundColor: isPaused ? '#4ADE80' : 'rgba(255,255,255,0.2)',
                      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
                      {isPaused ? '▶ Retomar' : '⏸ Pausar'}
                    </Text>
                  </TouchableOpacity>
                )
            )}
            {togglingOpen
              ? <ActivityIndicator color="#fff" />
              : (
                <Switch
                  value={isOpen}
                  onValueChange={handleToggleOpen}
                  trackColor={{ false: '#ccc', true: 'rgba(255,255,255,0.5)' }}
                  thumbColor="#fff"
                  disabled={loadingStore}
                />
              )
            }
          </View>
        </View>
      </View>

      {/* Trava de pagamento: sem Mercado Pago conectado a loja não abre/recebe */}
      {mp.enabled && !mp.connected && (
        <TouchableOpacity
          style={styles.mpLockCard}
          activeOpacity={0.85}
          onPress={() => router.push('/(store-tabs)/store')}
        >
          <View style={styles.mpLockIcon}>
            <Ionicons name="lock-closed" size={18} color="#B45309" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.mpLockTitle}>Conecte o Mercado Pago para abrir a loja</Text>
            <Text style={styles.mpLockText}>
              Sem isso a loja não recebe pedidos. Cadastre também uma chave PIX na sua conta MP para receber por PIX.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#B45309" />
        </TouchableOpacity>
      )}

      {/* Aceite dos Termos do Lojista — avisa, não trava: quem já vende não pode
          ficar com o painel bloqueado por uma lacuna de registro nossa. */}
      {!loadingStore && termsPending && (
        <View style={styles.termsCard}>
          <View style={styles.termsIcon}>
            <Ionicons name="document-text-outline" size={18} color="#C2410C" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.termsTitle}>Confirme os Termos do Lojista</Text>
            <Text style={styles.termsText}>
              Leia as regras de comissão, repasse e saque que valem para a sua loja e confirme o aceite.
            </Text>
            <View style={styles.termsActions}>
              <TouchableOpacity
                onPress={() => Linking.openURL(STORE_TERMS_URL).catch(() => {})}
                activeOpacity={0.7}
              >
                <Text style={styles.termsLink}>Ler os termos</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.termsBtn, acceptingTerms && { opacity: 0.6 }]}
                onPress={acceptTerms}
                disabled={acceptingTerms}
                activeOpacity={0.85}
              >
                <Text style={styles.termsBtnText}>{acceptingTerms ? 'Registrando…' : 'Li e aceito'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Boas-vindas / primeiro passo (loja recém-aprovada, ainda sem configurar) */}
      {!loadingStore && needsSetup && !welcomeDismissed && (
        <View style={styles.welcomeCard}>
          <TouchableOpacity style={styles.welcomeClose} onPress={() => setWelcomeDismissed(true)} hitSlop={8}>
            <Ionicons name="close" size={16} color="#B0895F" />
          </TouchableOpacity>
          <View style={styles.welcomeIcon}>
            <Ionicons name="sparkles" size={22} color="#fff" />
          </View>
          <Text style={styles.welcomeTitle}>Sua loja foi aprovada! 🎉</Text>
          <Text style={styles.welcomeText}>
            Primeiro passo: configure o perfil da loja — foto, horário de funcionamento e entrega — pra começar a receber pedidos.
          </Text>
          <TouchableOpacity
            style={styles.welcomeBtn}
            activeOpacity={0.85}
            onPress={() => { setWelcomeDismissed(true); router.push('/(store-tabs)/store') }}
          >
            <Text style={styles.welcomeBtnText}>Vamos lá</Text>
            <Ionicons name="arrow-forward" size={17} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Stats */}
      <View style={styles.statsGrid}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: stat.color + '18' }]}>
              <Ionicons name={stat.icon} size={20} color={stat.color} />
            </View>
            {(stat.loading ?? loadingOrders)
              ? <View style={styles.statSkeleton} />
              : <Text style={styles.statValue}>{stat.value}</Text>
            }
            <Text style={styles.statLabel}>{stat.label}</Text>
            {stat.trend && (
              <View style={styles.trendRow}>
                {stat.trendUp !== undefined && (
                  <Ionicons
                    name={stat.trendUp ? 'trending-up' : 'trending-down'}
                    size={11}
                    color={stat.trendUp ? '#16A34A' : '#DC2626'}
                  />
                )}
                <Text style={[styles.trendText, { color: stat.trendUp ? '#16A34A' : '#DC2626' }]}>
                  {stat.trend}
                </Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Analytics — últimos 7 dias */}
      {analytics && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Últimos 7 dias</Text>
            <TouchableOpacity onPress={() => router.push('/store-reports')}>
              <Text style={styles.sectionLink}>Ver completo →</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.analyticsRow}>
            <View style={styles.analyticsCard}>
              <Text style={styles.analyticsValue}>R$ {analytics.totalRevenue?.toFixed(0)}</Text>
              <Text style={styles.analyticsLabel}>Receita</Text>
            </View>
            <View style={styles.analyticsCard}>
              <Text style={styles.analyticsValue}>R$ {analytics.avgTicket?.toFixed(0)}</Text>
              <Text style={styles.analyticsLabel}>Ticket médio</Text>
            </View>
            <View style={styles.analyticsCard}>
              <Text style={[styles.analyticsValue, analytics.cancellationRate > 20 && { color: '#DC2626' }]}>
                {analytics.cancellationRate?.toFixed(0)}%
              </Text>
              <Text style={styles.analyticsLabel}>Cancelamentos</Text>
            </View>
          </View>

          {/* Mini bar chart */}
          {analytics.salesByDay && analytics.salesByDay.length > 0 && (() => {
            const maxRev = Math.max(...analytics.salesByDay.map((d: any) => d.revenue), 1)
            return (
              <View style={styles.chartWrap}>
                {analytics.salesByDay.map((d: any, i: number) => {
                  const barH = Math.max((d.revenue / maxRev) * 72, d.revenue > 0 ? 4 : 2)
                  const day = new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' })
                  return (
                    <View key={i} style={styles.chartCol}>
                      <Text style={styles.chartVal}>{d.revenue > 0 ? `R$${d.revenue.toFixed(0)}` : ''}</Text>
                      <View style={[styles.chartBar, { height: barH, backgroundColor: d.revenue > 0 ? colors.primary : '#EDE5DF' }]} />
                      <Text style={styles.chartDay}>{day}</Text>
                    </View>
                  )
                })}
              </View>
            )
          })()}

          {/* Top produtos */}
          {analytics.topProducts?.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Top produtos</Text>
              {analytics.topProducts.slice(0, 3).map((p: any, i: number) => (
                <View key={i} style={styles.topProductRow}>
                  <View style={styles.topProductRank}>
                    <Text style={styles.topProductRankText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.topProductName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.topProductQty}>{p.qty} vendidos</Text>
                </View>
              ))}
            </>
          )}
        </View>
      )}

      {/* Pedidos recentes */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Pedidos recentes</Text>
          <TouchableOpacity onPress={() => router.push('/(store-tabs)/orders')}>
            <Text style={styles.sectionLink}>Ver todos</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.ordersCard}>
          {loadingOrders ? (
            <View style={styles.ordersLoading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : recentOrders.length === 0 ? (
            <View style={styles.ordersEmpty}>
              <Ionicons name="receipt-outline" size={28} color="#C0B0A8" />
              <Text style={styles.ordersEmptyText}>Nenhum pedido ainda</Text>
            </View>
          ) : (
            recentOrders.map((order, i) => {
              const s = STATUS_MAP[order.status]
              const isLast = i === recentOrders.length - 1
              return (
                <View key={order.id} style={[styles.orderRow, !isLast && styles.orderRowBorder]}>
                  <View style={[styles.orderStripe, { backgroundColor: s.color }]} />
                  <View style={styles.orderBody}>
                    <View style={styles.orderTop}>
                      <Text style={styles.orderId}>{shortId(order.id)}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                        <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.orderClient}>{order.client}</Text>
                    <Text style={styles.orderItems} numberOfLines={1}>{order.items}</Text>
                    <View style={styles.orderBottom}>
                      <Text style={styles.orderTotal}>R$ {Number(order.total ?? 0).toFixed(2)}</Text>
                      <View style={styles.orderTimeWrap}>
                        <Ionicons name="time-outline" size={11} color="#9A8880" />
                        <Text style={styles.orderTime}>{order.time}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              )
            })
          )}
        </View>
      </View>

      {/* Ações rápidas */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ações rápidas</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickBtn} onPress={() => router.push('/(store-tabs)/products')} activeOpacity={0.8}>
            <View style={styles.quickIcon}>
              <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
            </View>
            <Text style={styles.quickLabel}>Novo produto</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => router.push('/(store-tabs)/orders')} activeOpacity={0.8}>
            <View style={styles.quickIcon}>
              <Ionicons name="receipt-outline" size={22} color={colors.primary} />
            </View>
            <Text style={styles.quickLabel}>Ver pedidos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => router.push('/store-reports')} activeOpacity={0.8}>
            <View style={styles.quickIcon}>
              <Ionicons name="bar-chart-outline" size={22} color={colors.primary} />
            </View>
            <Text style={styles.quickLabel}>Relatórios</Text>
          </TouchableOpacity>
        </View>
      </View>

    </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { paddingBottom: 32 },

  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingBottom: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  headerDecor1: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -80, right: -60,
  },
  headerDecor2: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: -40, left: -20,
  },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  greeting: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },
  date: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2, textTransform: 'capitalize' },
  avatarBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarText: { fontSize: 18, fontWeight: '900', color: '#fff' },
  avatarImg: { width: '100%', height: '100%' },

  storeStatusCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  storeStatusLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  storeStatusLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '600' },
  storeStatusValue: { fontSize: 15, color: '#fff', fontWeight: '800', marginTop: 1 },

  mpLockCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FEF3C7', borderRadius: 14,
    marginHorizontal: 16, marginTop: 14, padding: 14,
    borderWidth: 1.5, borderColor: '#FCD34D',
  },
  mpLockIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#FDE68A',
    alignItems: 'center', justifyContent: 'center',
  },
  mpLockTitle: { fontSize: 13.5, fontWeight: '800', color: '#78350F' },
  mpLockText: { fontSize: 12, color: '#92600A', marginTop: 2, lineHeight: 16 },

  termsCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#FFF7ED', borderRadius: 14,
    marginHorizontal: 16, marginTop: 14, padding: 14,
    borderWidth: 1.5, borderColor: '#FED7AA',
  },
  termsIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#FFEDD5',
    alignItems: 'center', justifyContent: 'center',
  },
  termsTitle: { fontSize: 13.5, fontWeight: '800', color: '#7C2D12' },
  termsText: { fontSize: 12, color: '#9A3412', marginTop: 2, lineHeight: 16 },
  termsActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 },
  termsLink: { fontSize: 12.5, fontWeight: '700', color: '#C2410C', textDecorationLine: 'underline' },
  termsBtn: { backgroundColor: '#EA580C', borderRadius: 9, paddingVertical: 8, paddingHorizontal: 16 },
  termsBtnText: { fontSize: 12.5, fontWeight: '800', color: '#fff' },

  welcomeCard: {
    backgroundColor: '#FFF3EB', borderRadius: 16,
    marginHorizontal: 16, marginTop: 14, padding: 18,
    borderWidth: 1.5, borderColor: '#FFD9C2', position: 'relative',
  },
  welcomeClose: { position: 'absolute', top: 12, right: 12, padding: 2 },
  welcomeIcon: {
    width: 44, height: 44, borderRadius: 13, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35, shadowRadius: 6, elevation: 4,
  },
  welcomeTitle: { fontSize: 17, fontWeight: '900', color: '#1A0A00', letterSpacing: -0.3, marginBottom: 5 },
  welcomeText: { fontSize: 13.5, color: '#7A5C4A', lineHeight: 19, marginBottom: 14 },
  welcomeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13,
    borderBottomWidth: 3, borderBottomColor: colors.primaryDark,
  },
  welcomeBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  statCard: {
    width: '47%', backgroundColor: '#fff', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  statIconWrap: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 22, fontWeight: '900', color: '#1A0A00', letterSpacing: -0.5 },
  statSkeleton: { height: 28, width: 60, backgroundColor: '#F0EBE5', borderRadius: 6, marginBottom: 2 },
  statLabel: { fontSize: 12, color: '#9A8880', marginTop: 2, fontWeight: '600' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 },
  trendText: { fontSize: 11, fontWeight: '600' },

  section: { paddingHorizontal: 16, marginTop: 8, marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1A0A00' },
  sectionLink: { fontSize: 13, color: colors.primary, fontWeight: '700' },

  ordersCard: {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  ordersLoading: { alignItems: 'center', paddingVertical: 32 },
  ordersEmpty: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  ordersEmptyText: { fontSize: 14, color: '#C0B0A8', fontWeight: '600' },

  orderRow: { flexDirection: 'row' },
  orderRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F5EEE9' },
  orderStripe: { width: 4 },
  orderBody: { flex: 1, padding: 14 },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  orderId: { fontSize: 13, fontWeight: '800', color: '#1A0A00' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  orderClient: { fontSize: 14, fontWeight: '700', color: '#1A0A00', marginBottom: 2 },
  orderItems: { fontSize: 12, color: '#9A8880', marginBottom: 6 },
  orderBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderTotal: { fontSize: 14, fontWeight: '900', color: colors.primary },
  orderTimeWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  orderTime: { fontSize: 11, color: '#9A8880' },

  quickActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  quickBtn: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  quickIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FFF0EB', alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 12, fontWeight: '700', color: '#1A0A00', textAlign: 'center' },

  pauseToast: {
    position: 'absolute', top: 0, left: 16, right: 16, zIndex: 999,
    backgroundColor: '#1A0A00', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    alignItems: 'center', shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 10,
  },
  pauseToastText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  analyticsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  analyticsCard: {
    flex: 1, backgroundColor: '#FFF0EB', borderRadius: 12, padding: 12, alignItems: 'center',
  },
  analyticsValue: { fontSize: 18, fontWeight: '900', color: colors.primary, letterSpacing: -0.5 },
  analyticsLabel: { fontSize: 11, fontWeight: '600', color: '#9A8880', marginTop: 2 },

  chartWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 100, marginBottom: 4 },
  chartCol: { flex: 1, alignItems: 'center', gap: 3 },
  chartBar: { width: '80%', borderRadius: 4, minHeight: 2 },
  chartDay: { fontSize: 9, color: '#9A8880', fontWeight: '600' },
  chartVal: { fontSize: 8, color: colors.primary, fontWeight: '700', textAlign: 'center' },

  topProductRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0EBE5',
  },
  topProductRank: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  topProductRankText: { fontSize: 11, fontWeight: '900', color: '#fff' },
  topProductName: { flex: 1, fontSize: 13, fontWeight: '700', color: '#1A0A00' },
  topProductQty: { fontSize: 12, color: '#9A8880', fontWeight: '600' },
})
