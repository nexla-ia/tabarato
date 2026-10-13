import { useState, useEffect } from 'react'
import { View, FlatList, StyleSheet, ActivityIndicator, Text, TouchableOpacity, RefreshControl, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../src/api/client'
import { OrderCard } from '../../src/components/OrderCard'
import { ReviewModal } from '../../src/components/ReviewModal'
import { colors } from '../../src/theme/colors'
import { Order } from '../../src/types'
import { useAuthStore } from '../../src/stores/auth.store'
import { useConsumerStore } from '../../src/stores/consumer.store'
import { useCartStore } from '../../src/stores/cart.store'
import { useToast } from '../../src/components/Toast'

const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PICKED_UP']

async function fetchOrders() {
  const { data } = await api.get<Order[]>('/orders')
  return data
}

export default function OrdersScreen() {
  const { show: toast } = useToast()
  const user = useAuthStore((s) => s.user)
  const setActiveOrderCount = useConsumerStore((s) => s.setActiveOrderCount)

  const { data: orders, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['orders'],
    queryFn: fetchOrders,
    enabled: !!user,
    refetchInterval: (query) => {
      // Always poll at 60s when logged in; increase to 15s if there are active orders
      if (!query.state.data) return 60_000  // fallback when data not yet loaded
      const hasActive = (query.state.data as Order[]).some((o) => ACTIVE_STATUSES.includes(o.status))
      return hasActive ? 15_000 : 60_000
    },
  })

  useEffect(() => {
    const count = (orders ?? []).filter((o) => ACTIVE_STATUSES.includes(o.status)).length
    setActiveOrderCount(count)
  }, [orders])

  const [reviewOrder, setReviewOrder] = useState<{ id: string; storeName: string } | null>(null)
  const [reviewedOrderIds, setReviewedOrderIds] = useState<Set<string>>(new Set())
  const addItem = useCartStore((s) => s.addItem)
  const clearCart = useCartStore((s) => s.clearCart)

  async function handleReorder(order: Order & { store?: any; items?: any[] }) {
    if (!order.store?.id) {
      toast('Não foi possível encontrar a loja deste pedido.', 'error')
      return
    }
    if (!order.items?.length) { router.push(`/store/${order.store.id}` as any); return }
    try {
      const { data: storeData } = await api.get(`/stores/${order.store.id}`)
      if (!storeData.isOpen) {
        toast('Esta loja está fechada no momento e não aceita pedidos.', 'info')
        return
      }
      Alert.alert(
        'Pedir novamente',
        `Isso irá substituir seu carrinho atual com os itens de ${order.store?.name}. Continuar?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Continuar',
            onPress: () => {
              clearCart()
              const catalog: any[] = storeData.products ?? []
              let added = 0
              let skipped = 0
              for (const item of order.items ?? []) {
                // usa o produto COMPLETO do catálogo (com preço/variações), não o mínimo do pedido
                const full = catalog.find((p) => p.id === (item.product?.id ?? item.productId))
                if (!full || full.isActive === false) { skipped++; continue } // produto removido/inativo
                const varId = item.variationId ?? item.variation?.id
                const variation = varId ? full.variations?.find((v: any) => v.id === varId) : undefined
                // Variação exigida mas não existe mais no catálogo → pula (evita item R$ 0,00)
                if (varId && !variation) { skipped++; continue }
                // Sem estoque suficiente (null = ilimitado) → pula
                const stock = variation ? variation.stock : full.stock
                if (stock !== null && stock !== undefined && stock < item.quantity) { skipped++; continue }
                addItem(order.store?.id, order.store?.name, full, variation, item.quantity)
                added++
              }
              if (added === 0) {
                Alert.alert('Itens indisponíveis', 'Nenhum item deste pedido está disponível para recompra no momento.')
                return
              }
              if (skipped > 0) {
                Alert.alert('Alguns itens indisponíveis', `${skipped} item(ns) fora de estoque ou removidos não foram adicionados.`)
              }
              router.push('/cart' as any)
            },
          },
        ],
      )
    } catch {
      router.push(`/store/${order.store?.id}` as any)
    }
  }

  function handleReviewSuccess() {
    if (reviewOrder) {
      setReviewedOrderIds((prev) => new Set([...prev, reviewOrder.id]))
    }
    setReviewOrder(null)
  }

  if (!user) {
    return (
      <View style={styles.guestContainer}>
        <View style={styles.guestIcon}>
          <Ionicons name="receipt-outline" size={48} color={colors.primary} />
        </View>
        <Text style={styles.guestTitle}>Seus pedidos aparecem aqui</Text>
        <Text style={styles.guestSub}>Entre na sua conta para ver o histórico de compras e acompanhar entregas.</Text>
        <TouchableOpacity style={styles.guestBtn} onPress={() => router.push('/(auth)/login')} activeOpacity={0.85}>
          <Text style={styles.guestBtnText}>Entrar na conta</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/(auth)/register')} activeOpacity={0.7}>
          <Text style={styles.guestRegisterText}>Criar conta grátis</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={orders?.length ? styles.list : styles.listEmpty}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        ListHeaderComponent={
          orders?.length ? (
            <Text style={styles.listTitle}>{orders.length} pedido{orders.length !== 1 ? 's' : ''}</Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <Text style={styles.emptyIcon}>📋</Text>
            </View>
            <Text style={styles.emptyTitle}>Nenhum pedido ainda</Text>
            <Text style={styles.emptySub}>Seus pedidos aparecerão aqui depois que você fizer a primeira compra</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/(tabs)')} activeOpacity={0.85}>
              <Text style={styles.emptyBtnText}>Explorar lojas</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const canReview = item.status === 'DELIVERED' && !reviewedOrderIds.has(item.id)
          const isDelivered = item.status === 'DELIVERED'
          return (
            <View>
              <OrderCard order={item} onPress={() => router.push(`/order/${item.id}` as any)} />
              {isDelivered && (
                <View style={styles.deliveredActions}>
                  {canReview && (
                    <TouchableOpacity
                      style={[styles.reviewBtn, { flex: 1 }]}
                      onPress={() => setReviewOrder({ id: item.id, storeName: (item as any).store?.name ?? 'Loja' })}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="star-outline" size={15} color={colors.primary} />
                      <Text style={styles.reviewBtnText}>Avaliar</Text>
                    </TouchableOpacity>
                  )}
                  {reviewedOrderIds.has(item.id) && (
                    <View style={[styles.reviewedBadge, { flex: 1 }]}>
                      <Ionicons name="checkmark-circle" size={14} color="#059669" />
                      <Text style={styles.reviewedText}>Avaliado</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.reorderBtn}
                    onPress={() => handleReorder(item as any)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="refresh-outline" size={15} color="#fff" />
                    <Text style={styles.reorderBtnText}>Pedir novamente</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )
        }}
      />

      {reviewOrder && (
        <ReviewModal
          visible
          orderId={reviewOrder.id}
          storeName={reviewOrder.storeName}
          onClose={() => setReviewOrder(null)}
          onSuccess={handleReviewSuccess}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  list: { padding: 16, paddingBottom: 32 },
  listEmpty: { flex: 1, padding: 16 },

  listTitle: {
    fontSize: 13, fontWeight: '600', color: colors.textMuted,
    marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5,
  },

  deliveredActions: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: -4, marginBottom: 16, paddingHorizontal: 0,
  },
  reviewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#FFF0EB', borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#FFD9BF',
  },
  reviewBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },

  reviewedBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#F0FDF4', borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  reviewedText: { fontSize: 12, fontWeight: '600', color: '#059669' },

  reorderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  reorderBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 8 },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21, marginBottom: 28 },
  emptyBtn: {
    backgroundColor: colors.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14,
    shadowColor: colors.primaryDark, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  guestContainer: {
    flex: 1, backgroundColor: '#F5F5F5',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  guestIcon: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  guestTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 8, textAlign: 'center' },
  guestSub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21, marginBottom: 28 },
  guestBtn: {
    backgroundColor: colors.primary, paddingHorizontal: 40, paddingVertical: 14,
    borderRadius: 14, marginBottom: 14, width: '100%', alignItems: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  guestBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  guestRegisterText: { fontSize: 14, color: colors.primary, fontWeight: '700' },
})
