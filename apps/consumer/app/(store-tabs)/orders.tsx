import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform, Animated } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { api } from '../../src/api/client'
import { useLojistaStore } from '../../src/stores/lojista.store'
import { colors } from '../../src/theme/colors'
import { useToast } from '../../src/components/Toast'

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED'

interface OrderItem {
  name: string
  qty: number
  price: number
  notes?: string
}

interface Order {
  id: string
  client: string
  phone: string
  items: OrderItem[]
  total: number
  deliveryFee: number
  notes?: string
  time: string
  createdAt: string
  address: string
  status: OrderStatus
  deliveryCourier?: string
  isPickup: boolean
  // A busca por entregador estourou o tempo: a loja precisa reanunciar.
  matchingExpired: boolean
}

const STATUS_MAP: Record<OrderStatus, { label: string; color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  PENDING:   { label: 'Pendente',   color: '#D97706', bg: '#FEF3C7', icon: 'time-outline' },
  CONFIRMED: { label: 'Confirmado', color: '#2563EB', bg: '#DBEAFE', icon: 'checkmark-circle-outline' },
  PREPARING: { label: 'Preparando', color: '#7C3AED', bg: '#EDE9FE', icon: 'flame-outline' },
  READY:     { label: 'Pronto',     color: '#059669', bg: '#D1FAE5', icon: 'bag-check-outline' },
  DELIVERED: { label: 'Entregue',   color: '#16A34A', bg: '#DCFCE7', icon: 'checkmark-done-outline' },
  CANCELLED: { label: 'Cancelado',  color: '#DC2626', bg: '#FEE2E2', icon: 'close-circle-outline' },
}

const FILTERS: { key: OrderStatus | 'ALL'; label: string }[] = [
  { key: 'ALL',       label: 'Todos' },
  { key: 'PENDING',   label: 'Pendentes' },
  { key: 'CONFIRMED', label: 'Confirmados' },
  { key: 'PREPARING', label: 'Preparando' },
  { key: 'READY',     label: 'Prontos' },
  { key: 'DELIVERED', label: 'Entregues' },
]

const ACTION_STATUS: Record<string, OrderStatus> = {
  confirm:       'CONFIRMED',
  reject:        'CANCELLED',
  prepare:       'PREPARING',
  ready:         'READY',
  'cancel-store':'CANCELLED',
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (diff < 1) return 'agora'
  if (diff < 60) return `${diff} min`
  const h = Math.floor(diff / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function formatAddress(a: any): string {
  if (!a) return 'Endereço não informado'
  let s = `${a.street}, ${a.number}`
  if (a.complement) s += `, ${a.complement}`
  return `${s} — ${a.district}`
}

function shortId(id: string): string {
  return '#' + id.slice(-6).toUpperCase()
}

function transformOrder(raw: any): Order {
  return {
    id: raw.id,
    client: raw.user?.name ?? 'Cliente',
    phone: raw.user?.phone ?? '',
    items: (raw.items ?? []).map((i: any) => ({
      name: i.variation ? `${i.product?.name} (${i.variation?.name})` : (i.product?.name ?? 'Produto'),
      qty: i.quantity,
      price: i.unitPrice,
      notes: i.notes,
    })),
    total: Number(raw.total ?? 0),
    deliveryFee: Number(raw.deliveryFee ?? 0),
    notes: raw.notes,
    time: timeAgo(raw.createdAt),
    createdAt: raw.createdAt,
    address: formatAddress(raw.address),
    status: raw.status,
    deliveryCourier: raw.delivery?.courier?.user?.name ?? undefined,
    isPickup: raw.fulfillmentType === 'PICKUP',
    matchingExpired: Boolean(raw.delivery?.matchingExpired),
  }
}

function PendingPulse() {
  const pulse = useRef(new Animated.Value(1)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start()
  }, [])
  return (
    <Animated.View
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        borderRadius: 16, borderWidth: 2.5, borderColor: '#D97706',
        opacity: pulse, pointerEvents: 'none',
      }}
    />
  )
}

function OrderCard({ order, onAction, onPrint, flash, reannouncing }: {
  order: Order
  onAction: (id: string, action: string) => void
  onPrint: (order: Order) => void
  flash?: boolean
  reannouncing?: boolean
}) {
  const [expanded, setExpanded] = useState(order.status === 'PENDING')
  const s = STATUS_MAP[order.status]
  const isPending = order.status === 'PENDING'
  const fadeAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (flash) {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0.3, duration: 120, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start()
    }
  }, [flash, order.status])

  return (
    <Animated.View style={[card.container, isPending && card.containerPending, { opacity: fadeAnim }]}>
      {isPending && <PendingPulse />}
      <View style={[card.stripe, { backgroundColor: s.color }]} />
      <View style={card.body}>

        <TouchableOpacity style={card.header} onPress={() => setExpanded(!expanded)} activeOpacity={0.8}>
          <View style={card.headerLeft}>
            <Text style={card.orderId}>{shortId(order.id)}</Text>
            <View style={[card.badge, { backgroundColor: s.bg }]}>
              <Ionicons name={s.icon} size={11} color={s.color} />
              <Text style={[card.badgeText, { color: s.color }]}>{s.label}</Text>
            </View>
            {order.isPickup && (
              <View style={[card.badge, { backgroundColor: '#FFF0EB' }]}>
                <Ionicons name="storefront" size={11} color="#FF5500" />
                <Text style={[card.badgeText, { color: '#FF5500' }]}>Retirada</Text>
              </View>
            )}
          </View>
          <View style={card.headerRight}>
            <Text style={card.total}>R$ {Number(order.total).toFixed(2)}</Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#9A8880" />
          </View>
        </TouchableOpacity>

        <View style={card.meta}>
          <Ionicons name="person-outline" size={13} color="#9A8880" />
          <Text style={card.metaText}>{order.client}</Text>
          <Text style={card.metaDot}>·</Text>
          <Ionicons name="time-outline" size={13} color="#9A8880" />
          <Text style={card.metaText}>{order.time} atrás</Text>
        </View>

        {expanded && (
          <View style={card.details}>
            <View style={card.itemsWrap}>
              {order.items.map((item, i) => (
                <View key={i} style={card.itemRow}>
                  <Text style={card.itemQty}>{item.qty}x</Text>
                  <Text style={card.itemName}>{item.name}</Text>
                  <Text style={card.itemPrice}>R$ {(item.qty * item.price).toFixed(2)}</Text>
                </View>
              ))}
              <View style={card.itemRow}>
                <Text style={card.itemQty} />
                <Text style={[card.itemName, { color: '#9A8880' }]}>{order.isPickup ? 'Retirada na loja' : 'Taxa de entrega'}</Text>
                <Text style={[card.itemPrice, { color: '#9A8880' }]}>{order.isPickup ? 'sem taxa' : `R$ ${Number(order.deliveryFee).toFixed(2)}`}</Text>
              </View>
            </View>

            {order.notes ? (
              <View style={card.notesWrap}>
                <Ionicons name="chatbubble-outline" size={13} color="#9A8880" />
                <Text style={card.notesText}>{order.notes}</Text>
              </View>
            ) : null}

            <View style={card.addressWrap}>
              <Ionicons name={order.isPickup ? 'storefront-outline' : 'location-outline'} size={13} color="#9A8880" />
              <Text style={card.addressText}>{order.isPickup ? 'Cliente retira na loja' : order.address}</Text>
            </View>

            {order.phone ? (
              <View style={[card.addressWrap, { marginTop: 6 }]}>
                <Ionicons name="call-outline" size={13} color="#9A8880" />
                <Text style={card.addressText}>{order.phone}</Text>
              </View>
            ) : null}

            {/* Conversar com o cliente (chat em tempo real) — só em pedido ativo */}
            {['PENDING', 'CONFIRMED', 'PREPARING', 'READY'].includes(order.status) && (
              <TouchableOpacity
                style={card.chatBtn}
                onPress={() => router.push(`/chat?orderId=${order.id}&peer=${encodeURIComponent('o cliente')}` as any)}
                activeOpacity={0.8}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={14} color="#FF5500" />
                <Text style={card.chatBtnText}>Conversar com o cliente</Text>
              </TouchableOpacity>
            )}

            {/* Botão de impressão térmica */}
            <TouchableOpacity
              style={card.printBtn}
              onPress={() => onPrint(order)}
              activeOpacity={0.8}
            >
              <Ionicons name="print-outline" size={14} color="#7C3AED" />
              <Text style={card.printBtnText}>Imprimir comanda</Text>
            </TouchableOpacity>
          </View>
        )}

        {order.status === 'PENDING' && (
          <>
            <View style={card.urgentBanner}>
              <Ionicons name="alert-circle" size={14} color="#92400E" />
              <Text style={card.urgentText}>Aguardando confirmação — responda para não perder o pedido</Text>
            </View>
            <View style={card.actions}>
              <TouchableOpacity
                style={[card.actionBtn, card.actionBtnDanger]}
                onPress={() => onAction(order.id, 'reject')}
                activeOpacity={0.8}
              >
                <Ionicons name="close-outline" size={16} color="#DC2626" />
                <Text style={[card.actionBtnText, { color: '#DC2626' }]}>Rejeitar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[card.actionBtn, card.actionBtnPrimary]}
                onPress={() => onAction(order.id, 'confirm')}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-outline" size={16} color="#fff" />
                <Text style={[card.actionBtnText, { color: '#fff' }]}>✓ Confirmar agora</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        {order.status === 'CONFIRMED' && (
          <TouchableOpacity
            style={[card.actionBtn, card.actionBtnFull, { backgroundColor: '#7C3AED' }]}
            onPress={() => onAction(order.id, 'prepare')}
            activeOpacity={0.8}
          >
            <Ionicons name="flame-outline" size={16} color="#fff" />
            <Text style={[card.actionBtnText, { color: '#fff' }]}>Iniciar preparo</Text>
          </TouchableOpacity>
        )}
        {order.status === 'PREPARING' && (
          <TouchableOpacity
            style={[card.actionBtn, card.actionBtnFull, { backgroundColor: '#059669' }]}
            onPress={() => onAction(order.id, 'ready')}
            activeOpacity={0.8}
          >
            <Ionicons name="bag-check-outline" size={16} color="#fff" />
            <Text style={[card.actionBtnText, { color: '#fff' }]}>Marcar como pronto</Text>
          </TouchableOpacity>
        )}
        {order.status === 'READY' && (
          <View style={{ gap: 8, marginTop: 14 }}>
            {order.isPickup ? (
              <>
                <View style={[card.courierBadge, { backgroundColor: '#FFF0EB', borderColor: '#FFD9BF' }]}>
                  <Ionicons name="storefront" size={14} color="#FF5500" />
                  <Text style={[card.courierBadgeText, { color: '#FF5500' }]}>Aguardando o cliente retirar</Text>
                </View>
                <TouchableOpacity
                  style={[card.actionBtn, card.actionBtnFull, { backgroundColor: '#059669', marginTop: 0 }]}
                  onPress={() => onAction(order.id, 'confirm-pickup')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark-done-outline" size={16} color="#fff" />
                  <Text style={[card.actionBtnText, { color: '#fff' }]}>Confirmar retirada</Text>
                </TouchableOpacity>
              </>
            ) : order.deliveryCourier ? (
              <View style={card.courierBadge}>
                <Ionicons name="bicycle" size={14} color="#0284C7" />
                <Text style={card.courierBadgeText}>{order.deliveryCourier}</Text>
              </View>
            ) : order.matchingExpired ? (
              /* A busca estourou o tempo — sem isto o pedido ficava "buscando" pra sempre
                 e a loja só conseguia reanunciar pelo navegador. */
              <>
                <View style={[card.courierBadge, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                  <Ionicons name="alert-circle-outline" size={14} color="#B45309" />
                  <Text style={[card.courierBadgeText, { color: '#B45309' }]}>
                    Nenhum entregador aceitou — reanuncie a corrida
                  </Text>
                </View>
                <TouchableOpacity
                  style={[card.actionBtn, card.actionBtnFull, { backgroundColor: '#0284C7', marginTop: 0 }, reannouncing && { opacity: 0.6 }]}
                  onPress={() => onAction(order.id, 'reannounce')}
                  disabled={reannouncing}
                  activeOpacity={0.8}
                >
                  {reannouncing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="megaphone-outline" size={16} color="#fff" />
                      <Text style={[card.actionBtnText, { color: '#fff' }]}>Reanunciar corrida</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <View style={[card.courierBadge, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}>
                <ActivityIndicator size="small" color="#0284C7" style={{ marginRight: 4 }} />
                <Text style={[card.courierBadgeText, { color: '#0284C7' }]}>Buscando entregador...</Text>
              </View>
            )}
            {/* Cancel always available for READY while courier hasn't picked up — backend validates */}
            <TouchableOpacity
              style={[card.actionBtn, { backgroundColor: '#FEE2E2', marginTop: 0 }]}
              onPress={() => onAction(order.id, 'cancel-store')}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
              <Text style={[card.actionBtnText, { color: '#DC2626' }]}>Cancelar pedido</Text>
            </TouchableOpacity>
          </View>
        )}
        {['CONFIRMED', 'PREPARING'].includes(order.status) && (
          <TouchableOpacity
            style={[card.actionBtn, { backgroundColor: '#FEE2E2', marginTop: 8 }]}
            onPress={() => onAction(order.id, 'cancel-store')}
            activeOpacity={0.8}
          >
            <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
            <Text style={[card.actionBtnText, { color: '#DC2626' }]}>Cancelar pedido</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  )
}

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

type DatePreset = 'all' | 'today' | 'yesterday' | 'week' | 'month'

function startOf(preset: DatePreset): Date | null {
  const now = new Date()
  if (preset === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (preset === 'yesterday') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    d.setDate(d.getDate() - 1)
    return d
  }
  if (preset === 'week') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    d.setDate(d.getDate() - 6)
    return d
  }
  if (preset === 'month') return new Date(now.getFullYear(), now.getMonth(), 1)
  return null
}

function endOf(preset: DatePreset): Date | null {
  if (preset === 'yesterday') {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }
  return null
}

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'all',       label: 'Todos' },
  { key: 'today',     label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: 'week',      label: '7 dias' },
  { key: 'month',     label: 'Este mês' },
]

async function handlePrintOrder(order: Order, toast: (message: string, type?: 'success' | 'error' | 'info') => void) {
  try {
    const { printOrder, scanPrinters, connectPrinter } = await import('../../src/utils/thermalPrinter')
    const printers = await scanPrinters()
    if (!printers.length) { toast('Ative o Bluetooth e certifique-se que a impressora está ligada.', 'info'); return }
    // Use first paired printer
    await connectPrinter(printers[0].address)
    await printOrder({
      id: order.id,
      clientName: order.client,
      address: order.address,
      items: order.items.map(i => ({ name: i.name, qty: i.qty, price: i.price, notes: i.notes })),
      subtotal: order.total - order.deliveryFee,
      deliveryFee: order.deliveryFee,
      discount: 0,
      total: order.total,
      paymentMethod: 'Ver pedido',
      notes: order.notes,
      createdAt: new Date().toISOString(),
    })
    toast(`Pedido ${order.id.slice(-6)} enviado para a impressora.`, 'success')
  } catch (err: any) {
    toast(err.message ?? 'Não foi possível imprimir.', 'error')
  }
}

export default function StoreOrdersScreen() {
  const { show: toast } = useToast()
  const [filter, setFilter] = useState<OrderStatus | 'ALL'>('PENDING')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [search, setSearch] = useState('')
  const [orders, setOrders] = useState<Order[]>([])
  const [flashedId, setFlashedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refusalOrderId, setRefusalOrderId] = useState<string | null>(null)
  const [refusalAction, setRefusalAction] = useState<'reject' | 'cancel-store'>('reject')
  const [refusalNote, setRefusalNote] = useState('')
  const [rejecting, setRejecting] = useState(false)
  // Retirada na loja: modal do código que o cliente mostra.
  const [pickupOrderId, setPickupOrderId] = useState<string | null>(null)
  const [pickupCode, setPickupCode] = useState('')
  const [pickupBusy, setPickupBusy] = useState(false)
  const [reannouncing, setReannouncing] = useState<string | null>(null)
  const setPendingCount = useLojistaStore((s) => s.setPendingCount)
  // Undo state
  const [undoState, setUndoState] = useState<{ orderId: string; previousStatus: OrderStatus; label: string } | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const { data } = await api.get('/orders/store')
      const transformed: Order[] = data.map(transformOrder)
      setOrders(transformed)
      setPendingCount(transformed.filter((o) => o.status === 'PENDING').length)
    } catch {
      // silently fail on background polls
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [setPendingCount])

  useEffect(() => {
    fetchOrders()
    const interval = setInterval(() => fetchOrders(true), 30_000)
    return () => clearInterval(interval)
  }, [fetchOrders])

  async function handleAction(id: string, action: string) {
    // Retirada na loja: abre o modal pra digitar o código do cliente.
    if (action === 'confirm-pickup') {
      setPickupCode('')
      setPickupOrderId(id)
      return
    }

    // Reanunciar: volta a ofertar a corrida aos entregadores (busca havia expirado).
    if (action === 'reannounce') {
      setReannouncing(id)
      try {
        await api.post(`/orders/${id}/reannounce`)
        toast('Corrida reanunciada! Procurando entregador de novo.', 'success')
        fetchOrders(true)
      } catch (err: any) {
        toast(err.response?.data?.message ?? 'Não foi possível reanunciar agora.', 'error')
      } finally {
        setReannouncing(null)
      }
      return
    }

    const newStatus = ACTION_STATUS[action]
    if (!newStatus) return

    if (action === 'reject' || action === 'cancel-store') {
      setRefusalNote('')
      setRefusalOrderId(id)
      setRefusalAction(action)
      return
    }

    const order = orders.find(o => o.id === id)
    const previousStatus = order?.status

    // Optimistic update + flash animation
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o))
    setFlashedId(id)
    setTimeout(() => setFlashedId(null), 600)

    try {
      await api.patch(`/orders/${id}/status`, { status: newStatus })
      // Show undo toast for 10 seconds
      if (previousStatus) {
        if (undoTimer.current) clearTimeout(undoTimer.current)
        setUndoState({ orderId: id, previousStatus, label: STATUS_MAP[newStatus]?.label ?? newStatus })
        undoTimer.current = setTimeout(() => setUndoState(null), 10_000)
      }
      fetchOrders(true)
    } catch (err: any) {
      // Revert optimistic update
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: previousStatus ?? o.status } : o))
      toast(err.response?.data?.message ?? 'Não foi possível atualizar o pedido.', 'error')
    }
  }

  async function handleUndo() {
    if (!undoState) return
    if (undoTimer.current) clearTimeout(undoTimer.current)
    const snapshot = undoState
    setUndoState(null)
    // Optimistic revert
    setOrders(prev => prev.map(o => o.id === snapshot.orderId ? { ...o, status: snapshot.previousStatus } : o))
    try {
      await api.patch(`/orders/${snapshot.orderId}/status`, { status: snapshot.previousStatus })
      fetchOrders(true)
    } catch (err: any) {
      // Revert the revert — put back the new status
      fetchOrders(true)
      toast(err.response?.data?.message ?? 'Não foi possível desfazer a ação.', 'error')
    }
  }

  const filtered = (() => {
    let list = filter === 'ALL' ? orders : orders.filter(o => o.status === filter)

    // Date preset filter
    const from = startOf(datePreset)
    const to   = endOf(datePreset)
    if (from) list = list.filter(o => new Date(o.createdAt) >= from)
    if (to)   list = list.filter(o => new Date(o.createdAt) < to)

    if (search.trim()) {
      const q = normalize(search)
      list = list.filter(o =>
        normalize(o.client).includes(q) ||
        o.id.slice(-6).toLowerCase().includes(q)
      )
    }

    // Ordem operacional (igual ao quadro web): pedidos EM ANDAMENTO primeiro, e entre
    // eles o mais ANTIGO no topo (FIFO — quem está esperando há mais tempo é atendido
    // primeiro). Finalizados (entregue/cancelado) vão depois, do mais recente pro mais
    // antigo. Antes a lista vinha só "mais recente no topo" e o lojista se perdia.
    const ACTIVE: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY']
    const isActive = (s: OrderStatus) => ACTIVE.includes(s)
    list = list.slice().sort((a, b) => {
      const aa = isActive(a.status), ba = isActive(b.status)
      if (aa !== ba) return aa ? -1 : 1
      const ta = new Date(a.createdAt).getTime(), tb = new Date(b.createdAt).getTime()
      return aa ? ta - tb : tb - ta
    })
    return list
  })()

  async function handleConfirmReject() {
    if (!refusalOrderId) return
    setRejecting(true)
    try {
      if (refusalAction === 'cancel-store') {
        await api.patch(`/orders/${refusalOrderId}/cancel-store`, { note: refusalNote.trim() || undefined })
      } else {
        const payload: Record<string, any> = { status: 'CANCELLED' }
        if (refusalNote.trim()) payload.refusalNote = refusalNote.trim()
        await api.patch(`/orders/${refusalOrderId}/status`, payload)
      }
      setRefusalOrderId(null)
      setRefusalNote('')
      fetchOrders(true)
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Não foi possível cancelar.', 'error')
    } finally {
      setRejecting(false)
    }
  }

  async function handleConfirmPickup() {
    if (!pickupOrderId || pickupCode.length < 4) return
    setPickupBusy(true)
    try {
      await api.post(`/orders/${pickupOrderId}/confirm-pickup`, { code: pickupCode })
      setPickupOrderId(null)
      setPickupCode('')
      toast('Retirada confirmada!', 'success')
      fetchOrders(true)
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Código inválido. Confira com o cliente.', 'error')
    } finally {
      setPickupBusy(false)
    }
  }

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color="#9A8880" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar cliente ou nº do pedido..."
          placeholderTextColor="#C0B0A8"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color="#9A8880" />
          </TouchableOpacity>
        )}
      </View>

      {/* Date preset filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateBar} contentContainerStyle={styles.dateContent}>
        {DATE_PRESETS.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[styles.dateBtn, datePreset === p.key && styles.dateBtnActive]}
            onPress={() => setDatePreset(p.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.dateBtnText, datePreset === p.key && styles.dateBtnTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterContent}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterBtn, active && styles.filterBtnActive]}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterBtnText, active && styles.filterBtnTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchOrders() }}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="receipt-outline" size={40} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Nenhum pedido</Text>
              <Text style={styles.emptySub}>
                {filter === 'ALL' ? 'Você ainda não recebeu pedidos' : 'Nenhum pedido nesta categoria'}
              </Text>
            </View>
          ) : (
            filtered.map((order) => (
              <OrderCard key={order.id} order={order} onAction={handleAction} onPrint={(o) => handlePrintOrder(o, toast)} flash={flashedId === order.id} reannouncing={reannouncing === order.id} />
            ))
          )}
        </ScrollView>
      )}

      {/* Undo toast */}
      {undoState && (
        <View style={styles.undoToast}>
          <Text style={styles.undoText}>Status → {undoState.label}</Text>
          <TouchableOpacity onPress={handleUndo} style={styles.undoBtn}>
            <Text style={styles.undoBtnText}>Desfazer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Refusal note modal */}
      <Modal
        visible={refusalOrderId !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setRefusalOrderId(null)}
      >
        <KeyboardAvoidingView
          style={rf.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={rf.sheet}>
            <View style={rf.handle}>
              <View style={rf.handleBar} />
            </View>

            <View style={rf.iconWrap}>
              <Ionicons name="close-circle" size={36} color="#DC2626" />
            </View>
            <Text style={rf.title}>
              {refusalAction === 'cancel-store' ? 'Cancelar pedido' : 'Rejeitar pedido'}
            </Text>
            <Text style={rf.sub}>
              {'📲 A mensagem abaixo será enviada diretamente para o cliente.'}
            </Text>

            <TextInput
              style={rf.input}
              value={refusalNote}
              onChangeText={setRefusalNote}
              placeholder="Ex: Produto esgotado, loja fechando em breve..."
              placeholderTextColor="#C0B0A8"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              maxLength={200}
            />
            <Text style={rf.charCount}>{refusalNote.length}/200</Text>

            <View style={rf.actions}>
              <TouchableOpacity
                style={rf.cancelBtn}
                onPress={() => setRefusalOrderId(null)}
                activeOpacity={0.8}
              >
                <Text style={rf.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[rf.confirmBtn, rejecting && { opacity: 0.7 }]}
                onPress={handleConfirmReject}
                disabled={rejecting}
                activeOpacity={0.8}
              >
                {rejecting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={rf.confirmBtnText}>Confirmar rejeição</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: confirmar retirada na loja */}
      <Modal
        visible={pickupOrderId !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setPickupOrderId(null)}
      >
        <KeyboardAvoidingView
          style={rf.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={rf.sheet}>
            <View style={rf.handle}>
              <View style={rf.handleBar} />
            </View>
            <View style={[rf.iconWrap, { backgroundColor: '#FFF0EB' }]}>
              <Ionicons name="storefront" size={34} color="#FF5500" />
            </View>
            <Text style={rf.title}>Confirmar retirada</Text>
            <Text style={rf.sub}>Peça ao cliente o código de retirada (aparece no app dele) e digite abaixo.</Text>

            <TextInput
              style={rf.codeInput}
              value={pickupCode}
              onChangeText={(t) => setPickupCode(t.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor="#C0B0A8"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />

            <View style={rf.actions}>
              <TouchableOpacity
                style={rf.cancelBtn}
                onPress={() => setPickupOrderId(null)}
                activeOpacity={0.8}
              >
                <Text style={rf.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[rf.confirmBtn, { backgroundColor: '#059669' }, (pickupBusy || pickupCode.length < 4) && { opacity: 0.6 }]}
                onPress={handleConfirmPickup}
                disabled={pickupBusy || pickupCode.length < 4}
                activeOpacity={0.8}
              >
                {pickupBusy
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={rf.confirmBtnText}>Confirmar retirada</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const rf = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FAF6F2',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  handle: { alignItems: 'center', marginBottom: 20 },
  handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E0D8D0' },
  iconWrap: { alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 20, fontWeight: '900', color: '#1A0A00', textAlign: 'center', marginBottom: 6 },
  sub: { fontSize: 13, color: '#9A8880', textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#EDE5DF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1A0A00',
    minHeight: 88,
  },
  charCount: { fontSize: 11, color: '#C0B0A8', textAlign: 'right', marginTop: 4, marginBottom: 16 },
  codeInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#EDE5DF',
    paddingVertical: 14,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 10,
    textAlign: 'center',
    color: '#1A0A00',
    marginBottom: 16,
  },
  actions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#F0EBE5', alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#7A6A60' },
  confirmBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#DC2626', alignItems: 'center',
    borderBottomWidth: 3, borderBottomColor: '#B91C1C',
    minHeight: 50, justifyContent: 'center',
  },
  confirmBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
})

const card = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  containerPending: {
    shadowColor: '#D97706',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  stripe: { width: 5 },
  body: { flex: 1, padding: 14 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderId: { fontSize: 14, fontWeight: '800', color: '#1A0A00' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  total: { fontSize: 15, fontWeight: '900', color: colors.primary },

  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 0 },
  metaText: { fontSize: 12, color: '#9A8880' },
  metaDot: { fontSize: 12, color: '#C8B8B0' },

  details: { marginTop: 14 },
  itemsWrap: {
    backgroundColor: '#F5F0EC', borderRadius: 10, padding: 10, gap: 6, marginBottom: 10,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemQty: { fontSize: 12, fontWeight: '800', color: colors.primary, width: 24 },
  itemName: { flex: 1, fontSize: 13, color: '#1A0A00', fontWeight: '600' },
  itemPrice: { fontSize: 13, fontWeight: '700', color: '#1A0A00' },

  notesWrap: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginBottom: 8 },
  notesText: { flex: 1, fontSize: 12, color: '#9A8880', fontStyle: 'italic' },

  addressWrap: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  addressText: { flex: 1, fontSize: 12, color: '#9A8880' },

  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
  },
  actionBtnFull: { marginTop: 14 },
  actionBtnDanger: { backgroundColor: '#FEE2E2' },
  actionBtnPrimary: { backgroundColor: colors.primary },
  actionBtnText: { fontSize: 13, fontWeight: '800' },
  courierBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#E0F2FE', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, marginTop: 14,
  },
  courierBadgeText: { fontSize: 13, fontWeight: '700', color: '#0284C7', flex: 1 },
  urgentBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF3C7', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7, marginTop: 10,
  },
  urgentText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#92400E' },
  printBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EDE9FE', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7, marginTop: 10, alignSelf: 'flex-start',
  },
  printBtnText: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },
  chatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFF0EB', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7, marginTop: 10, alignSelf: 'flex-start',
  },
  chatBtnText: { fontSize: 12, fontWeight: '700', color: '#FF5500' },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F0EBE5',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1A0A00', paddingVertical: 4 },

  dateBar: { backgroundColor: '#fff', maxHeight: 48, borderBottomWidth: 1, borderBottomColor: '#F0EBE5' },
  dateContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  dateBtn: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 16, backgroundColor: '#F5F0EC' },
  dateBtnActive: { backgroundColor: '#1A0A00' },
  dateBtnText: { fontSize: 12, fontWeight: '700', color: '#7A6A60' },
  dateBtnTextActive: { color: '#fff' },

  filterBar: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBE5',
    maxHeight: 52,
  },
  filterContent: { paddingHorizontal: 16, paddingVertical: 9, gap: 8 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F5F0EC' },
  filterBtnActive: { backgroundColor: colors.primary },
  filterBtnText: { fontSize: 13, fontWeight: '700', color: '#7A6A60' },
  filterBtnTextActive: { color: '#fff' },

  list: { padding: 16 },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#FFF0EB',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#1A0A00', marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#9A8880', textAlign: 'center' },

  undoToast: {
    position: 'absolute', bottom: 20, left: 16, right: 16,
    backgroundColor: '#1A0A00', borderRadius: 14,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 10,
  },
  undoText: { flex: 1, fontSize: 13, color: '#fff', fontWeight: '600' },
  undoBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  undoBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
})
