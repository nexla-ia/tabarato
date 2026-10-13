import { useRef, useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Animated, ActivityIndicator, Alert, Image, Clipboard, Platform,
} from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps'
import { useLocalSearchParams, router } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../../src/api/client'
import { getDeliverySocket, disconnectSocket } from '../../src/socket'
import { useAuthStore } from '../../src/stores/auth.store'
import { ReviewModal } from '../../src/components/ReviewModal'
import { CourierReviewModal } from '../../src/components/CourierReviewModal'
import { useToast } from '../../src/components/Toast'

const PRIMARY    = '#FF5500'
const SUCCESS    = '#059669'
const DANGER     = '#DC2626'
const BG         = '#FFF8F3'
const CARD       = '#FFFFFF'
const TEXT       = '#1A0A00'
const MUTED      = '#9A8880'
const BORDER     = '#F0E8E2'
const STEP_GRAY  = '#D4C8C2'

// ── Status config ────────────────────────────────────────────────────────────

interface StepDef {
  status: string
  label: string
  desc: string
  icon: React.ComponentProps<typeof Ionicons>['name']
}

const STEPS: StepDef[] = [
  { status: 'PENDING',   label: 'Aguardando', desc: 'Loja recebeu seu pedido',        icon: 'time-outline' },
  { status: 'CONFIRMED', label: 'Confirmado', desc: 'Loja confirmou o pedido',         icon: 'checkmark-circle-outline' },
  { status: 'PREPARING', label: 'Preparando', desc: 'Seu pedido está sendo preparado', icon: 'restaurant-outline' },
  { status: 'READY',     label: 'Pronto',     desc: 'Aguardando entregador',           icon: 'bag-handle-outline' },
  { status: 'DELIVERED', label: 'Entregue',   desc: 'Pedido entregue com sucesso',     icon: 'home-outline' },
]

// Retirada na loja: mesma linha do tempo, mas sem etapa de entregador.
const PICKUP_STEPS: StepDef[] = [
  { status: 'PENDING',   label: 'Aguardando', desc: 'Loja recebeu seu pedido',        icon: 'time-outline' },
  { status: 'CONFIRMED', label: 'Confirmado', desc: 'Loja confirmou o pedido',         icon: 'checkmark-circle-outline' },
  { status: 'PREPARING', label: 'Preparando', desc: 'Seu pedido está sendo preparado', icon: 'restaurant-outline' },
  { status: 'READY',     label: 'Pronto',     desc: 'Pronto — retire na loja',         icon: 'storefront-outline' },
  { status: 'DELIVERED', label: 'Retirado',   desc: 'Pedido retirado com sucesso',     icon: 'checkmark-done-outline' },
]

const TERMINAL_BAD = ['CANCELLED', 'REFUSED']

const STATUS_LABEL: Record<string, string> = {
  PENDING:   'Aguardando confirmação',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Preparando',
  READY:     'Pronto para retirada',
  PICKED_UP: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
  REFUSED:   'Recusado',
}

// ── Delivery tracking ─────────────────────────────────────────────────────────

interface DeliveryStep { key: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }

const DELIVERY_STEPS: DeliveryStep[] = [
  { key: 'COURIER_HEADING_TO_STORE', label: 'A caminho',  icon: 'navigate-outline' },
  { key: 'COURIER_AT_STORE',         label: 'Na loja',    icon: 'storefront-outline' },
  { key: 'PICKED_UP',                label: 'Coletado',   icon: 'bag-check-outline' },
  { key: 'DELIVERED',                label: 'Entregue',   icon: 'checkmark-circle-outline' },
]

const DELIVERY_STATUS_ORDER = [
  'SEARCHING_COURIER',
  'COURIER_HEADING_TO_STORE',
  'COURIER_AT_STORE',
  'PICKED_UP',
  'HEADING_TO_CLIENT',
  'DELIVERED',
]

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  SEARCHING_COURIER:         'Buscando entregador...',
  COURIER_HEADING_TO_STORE:  'Entregador indo à loja',
  COURIER_AT_STORE:          'Entregador na loja coletando',
  PICKED_UP:                 'Pedido a caminho!',
  HEADING_TO_CLIENT:         'Pedido a caminho!',
  DELIVERED:                 'Entregue!',
}

const LIVE_STATUSES = ['COURIER_HEADING_TO_STORE', 'COURIER_AT_STORE', 'PICKED_UP', 'HEADING_TO_CLIENT']

function DeliveryTracker({ delivery, courierPosition, addressLat, addressLng, deliveryCode }: {
  delivery: any
  courierPosition: { lat: number; lng: number } | null
  addressLat?: number
  addressLng?: number
  deliveryCode?: string | null
}) {
  const statusIdx = DELIVERY_STATUS_ORDER.indexOf(delivery.status)
  const courierName: string | undefined = delivery.courier?.user?.name
  const isSearching = delivery.status === 'SEARCHING_COURIER'
  const isDelivered = delivery.status === 'DELIVERED'
  const showMap = LIVE_STATUSES.includes(delivery.status) && courierPosition
  // Mostra o código enquanto há entregador a caminho (não busca / não entregue).
  const showCode = !!deliveryCode && !isSearching && !isDelivered

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Entregador</Text>
      <View style={styles.deliveryCard}>
        {/* Courier identity */}
        <View style={styles.courierRow}>
          <View style={[styles.courierAvatar, isSearching && styles.courierAvatarSearching]}>
            {isSearching
              ? <ActivityIndicator size="small" color={PRIMARY} />
              : <Ionicons name="bicycle" size={20} color={isDelivered ? SUCCESS : PRIMARY} />
            }
          </View>
          <View style={{ flex: 1 }}>
            {courierName
              ? <Text style={styles.courierName}>{courierName}</Text>
              : <Text style={[styles.courierName, { color: MUTED }]}>Aguardando entregador</Text>
            }
            <Text style={[styles.courierStatus, { color: isDelivered ? SUCCESS : PRIMARY }]}>
              {DELIVERY_STATUS_LABEL[delivery.status] ?? delivery.status}
            </Text>
          </View>
          {!isSearching && !isDelivered && (
            <View style={styles.liveChip}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>ao vivo</Text>
            </View>
          )}
          {isDelivered && (
            <Ionicons name="checkmark-circle" size={24} color={SUCCESS} />
          )}
        </View>

        {/* Código de entrega — cliente informa ao entregador para confirmar */}
        {showCode && (
          <View style={styles.codeBox}>
            <View style={styles.codeHeader}>
              <Ionicons name="lock-closed" size={15} color={PRIMARY} />
              <Text style={styles.codeTitle}>Código de entrega</Text>
            </View>
            <Text style={styles.codeDigits}>{deliveryCode}</Text>
            <Text style={styles.codeHint}>Informe este código ao entregador na hora da entrega.</Text>
          </View>
        )}

        {/* Progress bar */}
        {!isSearching && (
          <>
            <View style={styles.deliveryDivider} />
            <View style={styles.deliveryProgress}>
              {DELIVERY_STEPS.map((step, i) => {
                const stepOrder = DELIVERY_STATUS_ORDER.indexOf(step.key)
                const done = statusIdx > stepOrder
                const active = statusIdx === stepOrder || (step.key === 'PICKED_UP' && delivery.status === 'HEADING_TO_CLIENT')
                const color = done || active ? (isDelivered ? SUCCESS : PRIMARY) : '#E0D8D2'
                return (
                  <View key={step.key} style={styles.dpItem}>
                    <View style={[styles.dpDot, { backgroundColor: color, borderColor: color }]}>
                      {done
                        ? <Ionicons name="checkmark" size={8} color="#fff" />
                        : active
                          ? <Ionicons name={step.icon} size={8} color="#fff" />
                          : null
                      }
                    </View>
                    {i < DELIVERY_STEPS.length - 1 && (
                      <View style={[styles.dpLine, { backgroundColor: done ? (isDelivered ? SUCCESS : PRIMARY) : '#E0D8D2' }]} />
                    )}
                  </View>
                )
              })}
            </View>
            <View style={styles.deliveryProgressLabels}>
              {DELIVERY_STEPS.map(step => {
                const stepOrder = DELIVERY_STATUS_ORDER.indexOf(step.key)
                const isActive = statusIdx === stepOrder || (step.key === 'PICKED_UP' && delivery.status === 'HEADING_TO_CLIENT')
                return (
                  <Text key={step.key} style={[styles.dpLabel, isActive && { color: PRIMARY, fontWeight: '700' }]}>
                    {step.label}
                  </Text>
                )
              })}
            </View>
          </>
        )}

        {/* Live map */}
        {showMap && courierPosition && (
          <View style={styles.mapWrap}>
            <View style={styles.liveMapBadge}>
              <View style={styles.liveDotGreen} />
              <Text style={styles.liveMapText}>Entregador ao vivo</Text>
            </View>
            <MapView
              style={styles.map}
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              region={{
                latitude: courierPosition.lat,
                longitude: courierPosition.lng,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
            >
              <Marker
                coordinate={{ latitude: courierPosition.lat, longitude: courierPosition.lng }}
                title="Entregador"
                pinColor={PRIMARY}
              />
              {addressLat && addressLng && (
                <Marker
                  coordinate={{ latitude: addressLat, longitude: addressLng }}
                  title="Seu endereço"
                  pinColor="#22C55E"
                />
              )}
            </MapView>
          </View>
        )}
      </View>
    </View>
  )
}

const PAYMENT_LABEL: Record<string, string> = {
  PIX:         'Pix',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD:  'Cartão de débito',
  CASH:        'Dinheiro',
}

const PAYMENT_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  PIX:         'flash',
  CREDIT_CARD: 'card',
  DEBIT_CARD:  'card-outline',
  CASH:        'cash-outline',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val: number | string) { return `R$ ${Number(val ?? 0).toFixed(2)}` }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// ── Pulse animation component ─────────────────────────────────────────────────

function PulsingDot() {
  const scale = useRef(new Animated.Value(1)).current
  const opacity = useRef(new Animated.Value(0.6)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale,   { toValue: 1.8, duration: 900, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 1,   duration: 900, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0,   duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 900, useNativeDriver: true }),
        ]),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [])

  return (
    <View style={styles.pulseWrap}>
      <Animated.View style={[styles.pulseRing, { transform: [{ scale }], opacity }]} />
      <View style={styles.pulseDot} />
    </View>
  )
}

// ── Timeline step ─────────────────────────────────────────────────────────────

function TimelineStep({
  step, state, isLast,
}: {
  step: StepDef
  state: 'done' | 'active' | 'future'
  isLast: boolean
}) {
  const isDone   = state === 'done'
  const isActive = state === 'active'

  const dotBg    = isDone ? SUCCESS : isActive ? PRIMARY : CARD
  const dotBorder = isDone ? SUCCESS : isActive ? PRIMARY : STEP_GRAY
  const lineBg   = isDone ? SUCCESS : STEP_GRAY
  const labelColor = isDone || isActive ? TEXT : MUTED
  const descColor  = isDone || isActive ? MUTED : STEP_GRAY

  return (
    <View style={styles.stepRow}>
      {/* Left: dot + line */}
      <View style={styles.stepLeft}>
        <View style={[styles.stepDot, { backgroundColor: dotBg, borderColor: dotBorder }]}>
          {isDone && <Ionicons name="checkmark" size={12} color="#fff" />}
          {isActive && <PulsingDot />}
        </View>
        {!isLast && <View style={[styles.stepLine, { backgroundColor: lineBg }]} />}
      </View>

      {/* Right: text */}
      <View style={[styles.stepContent, !isLast && { paddingBottom: 28 }]}>
        <Text style={[styles.stepLabel, { color: labelColor, fontWeight: isActive ? '800' : '600' }]}>
          {step.label}
        </Text>
        <Text style={[styles.stepDesc, { color: descColor }]}>{step.desc}</Text>
      </View>
    </View>
  )
}

// ── PIX payment block ─────────────────────────────────────────────────────────

function PixPayment({ payment, orderId, onPaid }: {
  payment: any
  orderId: string
  onPaid: () => void
}) {
  const { show: toast } = useToast()
  const [copied, setCopied]     = useState(false)
  const [checking, setChecking] = useState(false)
  const [secondsLeft, setLeft]  = useState(0)

  useEffect(() => {
    if (!payment.pixExpiresAt) return
    const calc = () => Math.max(0, Math.floor((new Date(payment.pixExpiresAt).getTime() - Date.now()) / 1000))
    setLeft(calc())
    const t = setInterval(() => setLeft(calc()), 1000)
    return () => clearInterval(t)
  }, [payment.pixExpiresAt])

  async function handleCopy() {
    Clipboard.setString(payment.pixCode ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleCheckPayment() {
    setChecking(true)
    try {
      const { data } = await api.get(`/payments/orders/${orderId}/sync`)
      if (data?.status === 'PAID') onPaid()
      else toast('O pagamento ainda não foi confirmado. Tente novamente em instantes.', 'info')
    } catch {
      toast('Não foi possível verificar o pagamento.', 'error')
    } finally {
      setChecking(false)
    }
  }

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const secs = String(secondsLeft % 60).padStart(2, '0')
  const expired = secondsLeft === 0 && !!payment.pixExpiresAt

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Pagamento PIX</Text>
      <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
        {/* Status banner */}
        <View style={[styles.pixBanner, expired && styles.pixBannerExpired]}>
          <Ionicons
            name={expired ? 'close-circle-outline' : 'time-outline'}
            size={15}
            color={expired ? DANGER : '#D97706'}
          />
          <Text style={[styles.pixBannerText, expired && { color: DANGER }]}>
            {expired
              ? 'QR Code expirado — faça um novo pedido'
              : `Expira em ${mins}:${secs} · Aguardando pagamento`
            }
          </Text>
        </View>

        {!expired && (
          <View style={styles.pixBody}>
            {/* QR Code image */}
            {payment.pixQrBase64 ? (
              <Image
                source={{ uri: `data:image/png;base64,${payment.pixQrBase64}` }}
                style={styles.pixQr}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.pixQrPlaceholder}>
                <ActivityIndicator color={PRIMARY} />
                <Text style={styles.pixQrPlaceholderText}>Gerando QR Code...</Text>
              </View>
            )}

            <Text style={styles.pixHint}>Escaneie pelo app do banco ou copie o código abaixo</Text>

            {/* Copia e cola */}
            {payment.pixCode && (
              <TouchableOpacity style={styles.pixCopyBtn} onPress={handleCopy} activeOpacity={0.8}>
                <Ionicons name={copied ? 'checkmark-circle' : 'copy-outline'} size={16} color={copied ? SUCCESS : PRIMARY} />
                <Text style={[styles.pixCopyText, copied && { color: SUCCESS }]}>
                  {copied ? 'Copiado!' : 'Copiar código PIX'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.pixCheckBtn}
              onPress={handleCheckPayment}
              disabled={checking}
              activeOpacity={0.85}
            >
              {checking
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Ionicons name="refresh-outline" size={15} color="#fff" />
                    <Text style={styles.pixCheckText}>Já paguei — verificar</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  )
}

// ── Cartão via Checkout (aguardando confirmação) ───────────────────────────────

function CardCheckoutPending({ orderId, onPaid }: { orderId: string; onPaid: () => void }) {
  const { show: toast } = useToast()
  const [checking, setChecking] = useState(false)
  async function check() {
    setChecking(true)
    try {
      const { data } = await api.get(`/payments/orders/${orderId}/sync`)
      if (data?.status === 'PAID') onPaid()
      else toast('O pagamento ainda não foi confirmado. Tente novamente em instantes.', 'info')
    } catch {
      toast('Não foi possível verificar o pagamento.', 'error')
    } finally {
      setChecking(false)
    }
  }
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Pagamento com cartão</Text>
      <View style={[styles.card, { gap: 12 }]}>
        <Text style={{ color: MUTED, fontSize: 14, lineHeight: 20 }}>
          Aguardando a confirmação do pagamento na página segura do Asaas. Assim que for aprovado, seu pedido é confirmado automaticamente.
        </Text>
        <TouchableOpacity style={styles.pixCheckBtn} onPress={check} disabled={checking} activeOpacity={0.85}>
          {checking
            ? <ActivityIndicator size="small" color="#fff" />
            : <>
                <Ionicons name="refresh-outline" size={15} color="#fff" />
                <Text style={styles.pixCheckText}>Já paguei — verificar</Text>
              </>
          }
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ── Fetch ────────────────────────────────────────────────────────────────────

async function fetchOrder(id: string) {
  const { data } = await api.get(`/orders/${id}`)
  return data
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function OrderDetailScreen() {
  const insets = useSafeAreaInsets()
  const { show: toast } = useToast()
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()
  const accessToken = useAuthStore((s) => s.accessToken)

  const [showReview, setShowReview]               = useState(false)
  const [reviewed, setReviewed]                   = useState(false)
  const [showCourierReview, setShowCourierReview] = useState(false)
  const [courierReviewed, setCourierReviewed]     = useState(false)
  const [courierPosition, setCourierPosition]     = useState<{ lat: number; lng: number } | null>(null)

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => fetchOrder(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status || TERMINAL_BAD.includes(status) || status === 'DELIVERED') return false
      return 8_000
    },
  })

  // Hidrata "já avaliei?" no servidor — senão o botão "Avaliar" reaparece após
  // reabrir o app e o envio dá 409 (pedido já avaliado).
  useEffect(() => {
    if (order?.status !== 'DELIVERED') return
    api.get(`/reviews/check/${id}`).then((r) => setReviewed(!!r.data?.reviewed)).catch(() => {})
  }, [order?.status, id])

  const cancelMutation = useMutation({
    mutationFn: () => api.patch(`/orders/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
    onError: (err: any) => {
      toast(err.response?.data?.message ?? 'Não foi possível cancelar o pedido', 'error')
    },
  })

  // Connect to WebSocket and watch live courier position while delivery is active
  useEffect(() => {
    if (!id || !order?.delivery) return
    const isActive = LIVE_STATUSES.includes(order.delivery.status)
    if (!isActive) return

    const socket = getDeliverySocket(accessToken ?? undefined)
    socket.emit('order:watch', { orderId: id })

    const handler = (data: { lat: number; lng: number }) => setCourierPosition(data)
    socket.on('courier:position', handler)

    return () => {
      socket.off('courier:position', handler)
      socket.emit('order:unwatch', { orderId: id })
    }
  }, [id, order?.delivery?.status, accessToken])

  function handleCancel() {
    Alert.alert(
      'Cancelar pedido',
      'Tem certeza que deseja cancelar este pedido?',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Cancelar pedido',
          style: 'destructive',
          onPress: () => cancelMutation.mutate(),
        },
      ]
    )
  }

  // Sem id (deep link sem param) ou pedido inexistente → não encontrado
  if (!id || (!isLoading && !order)) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, gap: 12 }]}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: TEXT }}>Pedido não encontrado</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 12 }}>
          <Text style={{ color: PRIMARY, fontWeight: '700' }}>Voltar</Text>
        </TouchableOpacity>
      </View>
    )
  }
  if (isLoading || !order) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={PRIMARY} size="large" />
      </View>
    )
  }

  const isCancelledOrRefused = TERMINAL_BAD.includes(order.status)
  const isPickup = order.fulfillmentType === 'PICKUP'
  const steps = isPickup ? PICKUP_STEPS : STEPS
  // PICKED_UP is a legacy order status; treat as "between READY and DELIVERED"
  const currentStepIdx = (() => {
    if (order.status === 'DELIVERED') return steps.length - 1
    if (order.status === 'PICKED_UP') return steps.findIndex(s => s.status === 'READY') // show READY as active
    return steps.findIndex((s) => s.status === order.status)
  })()
  const canCancel       = ['PENDING', 'CONFIRMED'].includes(order.status)
  const canReview       = order.status === 'DELIVERED' && !reviewed
  const canReviewCourier = order.status === 'DELIVERED' && !courierReviewed && !!order.delivery?.courier

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color={TEXT} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{order.store?.name}</Text>
          <Text style={styles.headerSub}>{fmtDate(order.createdAt)}</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status hero card ── */}
        {isCancelledOrRefused ? (
          <View style={[styles.heroCard, styles.heroCardDanger]}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="close-circle" size={36} color={DANGER} />
            </View>
            <Text style={[styles.heroStatus, { color: DANGER }]}>
              {STATUS_LABEL[order.status] ?? order.status}
            </Text>
            {order.refusalNote ? (
              <Text style={styles.heroNote}>Motivo: {order.refusalNote}</Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.heroCard}>
            <View style={styles.heroLeft}>
              <View style={styles.heroBadge}>
                {order.status !== 'DELIVERED' && (
                  <Animated.View style={styles.heroBadgePulse} />
                )}
                <Ionicons
                  name={steps[currentStepIdx]?.icon ?? 'time-outline'}
                  size={22}
                  color={order.status === 'DELIVERED' ? SUCCESS : PRIMARY}
                />
              </View>
              <View>
                <Text style={styles.heroStatusLabel}>Status do pedido</Text>
                <Text style={[
                  styles.heroStatus,
                  { color: order.status === 'DELIVERED' ? SUCCESS : PRIMARY },
                ]}>
                  {STATUS_LABEL[order.status] ?? order.status}
                </Text>
              </View>
            </View>
            {order.status !== 'DELIVERED' && (
              <View style={styles.heroRefresh}>
                <Ionicons name="sync-outline" size={14} color={MUTED} />
                <Text style={styles.heroRefreshText}>auto</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Timeline ── */}
        {!isCancelledOrRefused && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Acompanhamento</Text>
            <View style={styles.timelineCard}>
              {steps.map((step, idx) => {
                const state =
                  idx < currentStepIdx  ? 'done'
                  : idx === currentStepIdx ? 'active'
                  : 'future'
                return (
                  <TimelineStep
                    key={step.status}
                    step={step}
                    state={state}
                    isLast={idx === steps.length - 1}
                  />
                )
              })}
            </View>
          </View>
        )}

        {/* ── Delivery tracker ── */}
        {!isPickup && order.delivery && !isCancelledOrRefused && (
          <DeliveryTracker
            delivery={order.delivery}
            courierPosition={courierPosition}
            addressLat={order.address?.lat}
            addressLng={order.address?.lng}
            deliveryCode={order.deliveryCode}
          />
        )}

        {/* ── Retirada na loja ── */}
        {isPickup && !isCancelledOrRefused && ['CONFIRMED', 'PREPARING', 'READY'].includes(order.status) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Retirada na loja</Text>
            <View style={styles.pickupBox}>
              <View style={styles.pickupBoxHead}>
                <View style={styles.pickupBoxIcon}>
                  <Ionicons name="storefront" size={18} color={PRIMARY} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickupBoxStore}>{order.store?.name}</Text>
                  {order.store?.address ? <Text style={styles.pickupBoxAddr}>{order.store.address}</Text> : null}
                  {order.store?.phone ? <Text style={styles.pickupBoxAddr}>{order.store.phone}</Text> : null}
                </View>
              </View>

              {order.status === 'READY' ? (
                <View style={styles.pickupCodeWrap}>
                  <View style={styles.codeHeader}>
                    <Ionicons name="key" size={15} color={PRIMARY} />
                    <Text style={styles.codeTitle}>Código de retirada</Text>
                  </View>
                  <Text style={styles.codeDigits}>{order.deliveryCode}</Text>
                  <Text style={styles.codeHint}>Mostre este código na loja para retirar seu pedido.</Text>
                </View>
              ) : (
                <View style={styles.pickupWaitRow}>
                  <Ionicons name="time-outline" size={15} color={MUTED} />
                  <Text style={styles.pickupWaitText}>
                    Assim que o pedido ficar pronto, aparece aqui o código para você retirar na loja.
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── PIX QR Code ── */}
        {order.payment?.method === 'PIX' && order.payment?.status === 'PENDING' && order.payment?.pixCode && (
          <PixPayment
            payment={order.payment}
            orderId={order.id}
            onPaid={() => queryClient.invalidateQueries({ queryKey: ['order', id] })}
          />
        )}

        {/* ── Cartão (Checkout Asaas) aguardando confirmação ── */}
        {['CREDIT_CARD', 'DEBIT_CARD'].includes(order.payment?.method) && order.payment?.status === 'PENDING' && order.status !== 'CANCELLED' && (
          <CardCheckoutPending
            orderId={order.id}
            onPaid={() => queryClient.invalidateQueries({ queryKey: ['order', id] })}
          />
        )}

        {/* ── Delivery photo ── */}
        {order.delivery?.photoUrl && order.status === 'DELIVERED' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Foto de entrega</Text>
            <View style={[styles.card, { padding: 0, overflow: 'hidden' }]}>
              <Image
                source={{ uri: order.delivery.photoUrl }}
                style={styles.deliveryPhoto}
                resizeMode="cover"
              />
              <View style={styles.deliveryPhotoCaption}>
                <Ionicons name="camera-outline" size={13} color={SUCCESS} />
                <Text style={styles.deliveryPhotoCaptionText}>Confirmação de entrega registrada pelo entregador</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Items ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Itens do pedido</Text>
          <View style={styles.card}>
            {order.items.map((item: any, idx: number) => (
              <View
                key={item.id}
                style={[styles.itemRow, idx < order.items.length - 1 && styles.itemRowBorder]}
              >
                <View style={styles.itemQtyBadge}>
                  <Text style={styles.itemQty}>{item.quantity}×</Text>
                </View>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.product.name}</Text>
                  {item.variation && (
                    <Text style={styles.itemVariation}>{item.variation.name}</Text>
                  )}
                  {item.notes ? (
                    <Text style={styles.itemNotes}>📝 {item.notes}</Text>
                  ) : null}
                </View>
                <Text style={styles.itemPrice}>{fmt(item.unitPrice * item.quantity)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Address ── */}
        {order.address && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Endereço de entrega</Text>
            <View style={[styles.card, styles.addressCard]}>
              <View style={styles.addressIcon}>
                <Ionicons name="location" size={18} color={PRIMARY} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.addressLabel}>{order.address.label}</Text>
                <Text style={styles.addressText}>
                  {order.address.street}, {order.address.number}
                  {order.address.complement ? `, ${order.address.complement}` : ''}
                </Text>
                <Text style={styles.addressDistrict}>
                  {order.address.district} · {order.address.city}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Payment + totals ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pagamento</Text>
          <View style={styles.card}>
            {order.payment && (
              <View style={styles.paymentRow}>
                <View style={styles.paymentChip}>
                  <Ionicons
                    name={PAYMENT_ICON[order.payment.method] ?? 'card-outline'}
                    size={15}
                    color={PRIMARY}
                  />
                  <Text style={styles.paymentChipText}>
                    {PAYMENT_LABEL[order.payment.method] ?? order.payment.method}
                  </Text>
                </View>
                {order.payment.status === 'PAID' && (
                  <View style={styles.paidBadge}>
                    <Ionicons name="checkmark-circle" size={13} color={SUCCESS} />
                    <Text style={styles.paidBadgeText}>Pago</Text>
                  </View>
                )}
                {order.payment.status === 'PENDING' && order.payment.method === 'PIX' && (
                  <View style={styles.pendingBadge}>
                    <Text style={styles.pendingBadgeText}>Aguardando</Text>
                  </View>
                )}
                {order.payment.status === 'FAILED' && (
                  <View style={[styles.pendingBadge, { backgroundColor: '#FEE2E2' }]}>
                    <Text style={[styles.pendingBadgeText, { color: DANGER }]}>Falhou</Text>
                  </View>
                )}
              </View>
            )}

            {/* PIX que falhou/expirou: explica e orienta a refazer (o QR só vale 30 min). */}
            {order.payment?.method === 'PIX' && order.payment?.status === 'FAILED' && order.status !== 'CANCELLED' && (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, marginTop: 10 }}>
                <Ionicons name="information-circle-outline" size={15} color={DANGER} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 12.5, color: '#9A5555', lineHeight: 17 }}>
                  O código PIX expirou ou não foi pago a tempo (o QR vale 30 min). Faça um novo pedido para gerar um novo código.
                </Text>
              </View>
            )}

            <View style={styles.divider} />

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{fmt(order.subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="bicycle-outline" size={13} color={MUTED} />
                <Text style={styles.totalLabel}>Entrega</Text>
              </View>
              <Text style={styles.totalValue}>{fmt(order.deliveryFee)}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.totalRow}>
              <Text style={styles.totalFinalLabel}>Total</Text>
              <Text style={styles.totalFinalValue}>{fmt(order.total)}</Text>
            </View>
          </View>
        </View>

        {/* ── Notes ── */}
        {order.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Observações</Text>
            <View style={[styles.card, styles.notesCard]}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={MUTED} />
              <Text style={styles.notesText}>{order.notes}</Text>
            </View>
          </View>
        )}

        {/* ── Actions ── */}
        {(canReview || canReviewCourier || canCancel) && (
          <View style={styles.actions}>
            {canReview && (
              <TouchableOpacity
                style={styles.reviewBtn}
                onPress={() => setShowReview(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="star" size={18} color="#fff" />
                <Text style={styles.reviewBtnText}>Avaliar loja</Text>
              </TouchableOpacity>
            )}
            {canReviewCourier && (
              <TouchableOpacity
                style={[styles.reviewBtn, { backgroundColor: '#7C3AED' }]}
                onPress={() => setShowCourierReview(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="bicycle" size={18} color="#fff" />
                <Text style={styles.reviewBtnText}>Avaliar entregador</Text>
              </TouchableOpacity>
            )}
            {canCancel && (
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleCancel}
                activeOpacity={0.85}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending
                  ? <ActivityIndicator size="small" color={DANGER} />
                  : <Text style={styles.cancelBtnText}>Cancelar pedido</Text>
                }
              </TouchableOpacity>
            )}

            {/* Chat button — available for active orders */}
            {order && !['DELIVERED', 'CANCELLED'].includes(order.status) && (
              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                onPress={() => router.push(`/chat?orderId=${id}` as any)}
                activeOpacity={0.85}
              >
                <Text style={[styles.cancelBtnText, { color: '#2563EB' }]}>💬 Chat com loja / entregador</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {showReview && (
        <ReviewModal
          visible
          orderId={id}
          storeName={order.store?.name ?? 'Loja'}
          onClose={() => setShowReview(false)}
          onSuccess={() => { setReviewed(true); setShowReview(false) }}
        />
      )}

      {showCourierReview && (
        <CourierReviewModal
          visible
          orderId={id}
          courierName={order.delivery?.courier?.user?.name ?? 'Entregador'}
          onClose={() => setShowCourierReview(false)}
          onSuccess={() => { setCourierReviewed(true); setShowCourierReview(false) }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: BG },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: BG,
    borderBottomWidth: 1, borderBottomColor: BORDER,
    gap: 10,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: '#F0E8E2',
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '800', color: TEXT, letterSpacing: -0.2 },
  headerSub:   { fontSize: 11, color: MUTED, marginTop: 1 },

  // Hero card
  heroCard: {
    backgroundColor: CARD, borderRadius: 18,
    padding: 18, marginBottom: 16,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  heroCardDanger: { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  heroLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  heroBadge: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: '#FFF0EB',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  heroBadgePulse: {
    position: 'absolute', width: 52, height: 52, borderRadius: 16,
    backgroundColor: PRIMARY, opacity: 0.12,
  },
  heroIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#FFF5F5',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  heroStatusLabel: { fontSize: 11, color: MUTED, fontWeight: '600', marginBottom: 2 },
  heroStatus:      { fontSize: 17, fontWeight: '900', letterSpacing: -0.4 },
  heroNote:        { fontSize: 12, color: MUTED, marginTop: 4, flex: 1 },
  heroRefresh: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  heroRefreshText: { fontSize: 10, color: MUTED, fontWeight: '600' },

  // PIX
  pixBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF3C7', padding: 12,
  },
  pixBannerExpired: { backgroundColor: '#FEE2E2' },
  pixBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#D97706' },
  pixBody: { padding: 20, alignItems: 'center' },
  pixQr: { width: 200, height: 200, marginBottom: 12 },
  pixQrPlaceholder: {
    width: 200, height: 200, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F5F0EC', borderRadius: 12, marginBottom: 12, gap: 8,
  },
  pixQrPlaceholderText: { fontSize: 12, color: MUTED },
  pixHint: { fontSize: 12, color: MUTED, textAlign: 'center', marginBottom: 16 },
  pixCopyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 12,
    paddingVertical: 11, paddingHorizontal: 20,
    backgroundColor: '#FFF0EB', width: '100%', justifyContent: 'center', marginBottom: 10,
  },
  pixCopyText: { fontSize: 14, fontWeight: '700', color: PRIMARY },
  pixCheckBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: SUCCESS, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 20,
    width: '100%', justifyContent: 'center',
  },
  pixCheckText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  // Payment badges
  paidBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#D1FAE5', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  paidBadgeText: { fontSize: 11, fontWeight: '700', color: SUCCESS },
  pendingBadge: {
    backgroundColor: '#FEF3C7', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  pendingBadgeText: { fontSize: 11, fontWeight: '700', color: '#D97706' },

  deliveryPhoto: { width: '100%', height: 220 },
  deliveryPhotoCaption: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    padding: 10, backgroundColor: '#F0FDF4',
  },
  deliveryPhotoCaptionText: { flex: 1, fontSize: 12, color: SUCCESS, fontWeight: '600' },

  // Section
  section:      { marginBottom: 16 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: MUTED,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 8, paddingHorizontal: 2,
  },

  // Generic card
  card: {
    backgroundColor: CARD, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },

  // Timeline
  timelineCard: { backgroundColor: CARD, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: BORDER },
  stepRow:    { flexDirection: 'row', gap: 14 },
  stepLeft:   { alignItems: 'center', width: 24 },
  stepDot: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 1,
  },
  stepLine:    { flex: 1, width: 2, marginTop: 2 },
  stepContent: { flex: 1, paddingBottom: 4, paddingTop: 2 },
  stepLabel:   { fontSize: 14, color: TEXT, marginBottom: 2 },
  stepDesc:    { fontSize: 12, lineHeight: 16 },

  // Pulse
  pulseWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  pulseRing: {
    position: 'absolute',
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: PRIMARY,
  },
  pulseDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#fff',
  },

  // Items
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, gap: 10 },
  itemRowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  itemQtyBadge: {
    backgroundColor: '#FFF0EB', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, minWidth: 34, alignItems: 'center',
  },
  itemQty:       { fontSize: 12, fontWeight: '800', color: PRIMARY },
  itemInfo:      { flex: 1 },
  itemName:      { fontSize: 14, fontWeight: '600', color: TEXT },
  itemVariation: { fontSize: 12, color: MUTED, marginTop: 2 },
  itemNotes:     { fontSize: 11, color: MUTED, marginTop: 3 },
  itemPrice:     { fontSize: 14, fontWeight: '700', color: TEXT },

  // Address
  addressCard: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 12 },
  addressIcon: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#FFF0EB', alignItems: 'center', justifyContent: 'center',
  },
  addressLabel:    { fontSize: 12, fontWeight: '700', color: PRIMARY, marginBottom: 3 },
  addressText:     { fontSize: 13, color: TEXT, fontWeight: '500', lineHeight: 18 },
  addressDistrict: { fontSize: 12, color: MUTED, marginTop: 2 },

  // Payment
  paymentRow: { padding: 14 },
  paymentChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFF0EB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
    alignSelf: 'flex-start',
  },
  paymentChipText: { fontSize: 13, fontWeight: '700', color: PRIMARY },

  divider: { height: 1, backgroundColor: BORDER, marginHorizontal: 14 },

  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 9,
  },
  totalLabel:      { fontSize: 14, color: MUTED },
  totalValue:      { fontSize: 14, color: TEXT, fontWeight: '500' },
  totalFinalLabel: { fontSize: 16, fontWeight: '800', color: TEXT },
  totalFinalValue: { fontSize: 18, fontWeight: '900', color: PRIMARY },

  // Notes
  notesCard: { flexDirection: 'row', gap: 10, padding: 14, alignItems: 'flex-start' },
  notesText: { flex: 1, fontSize: 13, color: TEXT, lineHeight: 19 },

  // Delivery tracker
  deliveryCard: {
    backgroundColor: CARD, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  courierRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  codeBox: {
    marginHorizontal: 14, marginBottom: 14, padding: 16, borderRadius: 14,
    backgroundColor: '#FFF3EB', borderWidth: 1, borderColor: '#FFD9C2', alignItems: 'center',
  },
  codeHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  codeTitle: { fontSize: 12, fontWeight: '700', color: PRIMARY, textTransform: 'uppercase', letterSpacing: 0.5 },
  codeDigits: { fontSize: 40, fontWeight: '800', color: TEXT, letterSpacing: 12, marginLeft: 12 },
  codeHint: { fontSize: 12.5, color: MUTED, textAlign: 'center', marginTop: 6, lineHeight: 17 },

  // ── Retirada na loja (tela do pedido) ──
  pickupBox: {
    backgroundColor: CARD, borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: BORDER,
  },
  pickupBoxHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  pickupBoxIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFF0EB',
    alignItems: 'center', justifyContent: 'center',
  },
  pickupBoxStore: { fontSize: 15, fontWeight: '800', color: TEXT, marginBottom: 3 },
  pickupBoxAddr: { fontSize: 12.5, color: MUTED, lineHeight: 18 },
  pickupCodeWrap: {
    marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: BORDER,
    alignItems: 'center',
  },
  pickupWaitRow: {
    marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: BORDER,
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
  },
  pickupWaitText: { flex: 1, fontSize: 12.5, color: MUTED, lineHeight: 18 },
  courierAvatar: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#FFF0EB', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: PRIMARY + '33',
  },
  courierAvatarSearching: { backgroundColor: '#F5F5F5', borderColor: BORDER },
  courierName: { fontSize: 15, fontWeight: '800', color: TEXT, marginBottom: 2 },
  courierStatus: { fontSize: 12, fontWeight: '600' },
  liveChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FFF0EB', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: PRIMARY + '33',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: PRIMARY },
  liveText: { fontSize: 10, fontWeight: '700', color: PRIMARY },
  mapWrap: { marginTop: 12, borderRadius: 14, overflow: 'hidden', position: 'relative' },
  map: { width: '100%', height: 200 },
  liveMapBadge: {
    position: 'absolute', top: 8, left: 8, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20,
  },
  liveDotGreen: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E' },
  liveMapText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  deliveryDivider: { height: 1, backgroundColor: BORDER },
  deliveryProgress: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2 },
  dpItem: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  dpDot: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dpLine: { flex: 1, height: 2, marginHorizontal: 2 },
  deliveryProgressLabels: { flexDirection: 'row', paddingHorizontal: 10, paddingBottom: 14, paddingTop: 4 },
  dpLabel: { flex: 1, fontSize: 9, fontWeight: '600', color: MUTED, textAlign: 'center' },

  // Actions
  actions: { gap: 10, marginBottom: 8 },
  reviewBtn: {
    backgroundColor: PRIMARY, borderRadius: 14,
    paddingVertical: 15, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  reviewBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn: {
    borderWidth: 2, borderColor: DANGER, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { color: DANGER, fontSize: 15, fontWeight: '700' },
})
