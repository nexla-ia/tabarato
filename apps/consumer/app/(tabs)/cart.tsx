import { useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useCartStore } from '../../src/stores/cart.store'
import { promoLabel, promoDiscountFor } from '../../src/utils/promo'
import { api } from '../../src/api/client'
import { colors } from '../../src/theme/colors'
import { useToast } from '../../src/components/Toast'

// A taxa de entrega é calculada por loja no checkout (por distância).

function QuantityStepper({
  quantity, onIncrease, onDecrease,
}: { quantity: number; onIncrease: () => void; onDecrease: () => void }) {
  return (
    <View style={stepper.wrap}>
      <TouchableOpacity onPress={onDecrease} style={stepper.btn} activeOpacity={0.7}>
        <Ionicons name={quantity === 1 ? 'trash-outline' : 'remove'} size={14} color={quantity === 1 ? colors.danger : colors.primary} />
      </TouchableOpacity>
      <Text style={stepper.count}>{quantity}</Text>
      <TouchableOpacity onPress={onIncrease} style={[stepper.btn, stepper.btnAdd]} activeOpacity={0.7}>
        <Ionicons name="add" size={14} color="#fff" />
      </TouchableOpacity>
    </View>
  )
}

const stepper = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F0EC', borderRadius: 20, overflow: 'hidden', height: 32 },
  btn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  btnAdd: { backgroundColor: colors.primary },
  count: { fontSize: 14, fontWeight: '800', color: colors.text, minWidth: 28, textAlign: 'center' },
})

export default function CartScreen() {
  const { show: toast } = useToast()
  const { items, groups, updateQuantity, clearCart, clearStore, total, itemCount, storeCount, storePromoDiscount } = useCartStore()

  const subtotal = total()
  const count = itemCount()
  const stores = storeCount()
  const cartGroups = groups()
  const totalPromo = cartGroups.reduce((s, g) => s + storePromoDiscount(g.storeId), 0)
  const netTotal = Math.max(0, subtotal - totalPromo)

  // Revalida preços/promoções no servidor ao abrir o carrinho — o snapshot pode ter
  // ficado velho (loja mudou o preço) e o backend cobra o valor atual. Avisa se mudou.
  useEffect(() => {
    const ids = [...new Set(useCartStore.getState().items.map((i) => i.product.id))]
    if (!ids.length) return
    let cancelled = false
    Promise.all(ids.map((id) => api.get(`/products/${id}`).then((r) => r.data).catch(() => null)))
      .then((list) => {
        if (cancelled) return
        const fresh = list.filter(Boolean)
        if (!fresh.length) return
        const changed = useCartStore.getState().syncProducts(fresh)
        if (changed > 0) {
          toast('A loja atualizou o preço de alguns itens do seu carrinho. Confira antes de finalizar.', 'success')
        }
      })
    return () => { cancelled = true }
  }, [])

  function handleClearCart() {
    Alert.alert('Limpar carrinho', 'Remover todos os itens de todas as lojas?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Limpar', style: 'destructive', onPress: clearCart },
    ])
  }

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconOuter}>
          <View style={styles.emptyIconInner}>
            <Ionicons name="cart-outline" size={48} color={colors.primary} />
          </View>
        </View>
        <Text style={styles.emptyTitle}>Carrinho vazio</Text>
        <Text style={styles.emptySub}>Adicione itens de uma ou mais lojas para{'\n'}começar seu pedido</Text>
        <TouchableOpacity style={styles.emptyBtn} onPress={() => router.replace('/(tabs)')} activeOpacity={0.85}>
          <Ionicons name="storefront-outline" size={16} color="#fff" />
          <Text style={styles.emptyBtnText}>Ver lojas</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Cabeçalho: voltar + nº de lojas + limpar tudo */}
        <View style={styles.topRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <TouchableOpacity
              onPress={() => (router.canGoBack() ? router.back() : router.push('/(tabs)'))}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={22} color="#1A0A00" />
            </TouchableOpacity>
            <Text style={styles.topTitle}>
              {stores} {stores === 1 ? 'loja' : 'lojas'} · {count} {count === 1 ? 'item' : 'itens'}
            </Text>
          </View>
          <TouchableOpacity onPress={handleClearCart} style={styles.clearAllBtn} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={15} color={colors.danger} />
            <Text style={styles.clearAllText}>Limpar</Text>
          </TouchableOpacity>
        </View>

        {/* Um bloco por loja */}
        {cartGroups.map((g) => {
          const storeSubtotal = g.items.reduce((s, i) => s + Number(i.variation?.price ?? i.product.basePrice ?? 0) * i.quantity, 0)
          return (
            <View key={g.storeId} style={styles.storeCard}>
              <View style={styles.storeHeader}>
                <View style={styles.storeLogoWrap}>
                  <Ionicons name="storefront" size={18} color={colors.primary} />
                </View>
                <Text style={styles.storeName} numberOfLines={1}>{g.storeName}</Text>
                <TouchableOpacity onPress={() => clearStore(g.storeId)} style={styles.storeClear}>
                  <Ionicons name="close" size={16} color={colors.textLight} />
                </TouchableOpacity>
              </View>

              {g.items.map((item, index) => {
                const price = Number(item.variation?.price ?? item.product.basePrice ?? 0)
                const lineTotal = price * item.quantity
                const isLast = index === g.items.length - 1
                const pLabel = promoLabel(item.product.promoBuyQty, item.product.promoPayQty)
                const pSaved = promoDiscountFor(item.quantity, price, item.product.promoBuyQty, item.product.promoPayQty)
                return (
                  <View key={`${item.product.id}-${item.variation?.id}`} style={[styles.itemRow, !isLast && styles.itemRowBorder]}>
                    <View style={styles.itemLeft}>
                      <View style={styles.itemIconWrap}>
                        <Ionicons name="cube-outline" size={18} color={colors.textMuted} />
                      </View>
                      <View style={styles.itemDetails}>
                        <Text style={styles.itemName} numberOfLines={2}>{item.product.name}</Text>
                        {item.variation && <Text style={styles.itemVariation}>{item.variation.name}</Text>}
                        {item.notes ? <Text style={styles.itemNotes} numberOfLines={1}>{item.notes}</Text> : null}
                        {pLabel && (
                          <View style={styles.promoPill}>
                            <Ionicons name="pricetag" size={10} color="#15803D" />
                            <Text style={styles.promoPillText}>
                              {pLabel}{pSaved > 0 ? ` · economize R$ ${pSaved.toFixed(2)}` : ''}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.itemPrice}>R$ {lineTotal.toFixed(2)}</Text>
                      </View>
                    </View>
                    <QuantityStepper
                      quantity={item.quantity}
                      onIncrease={() => updateQuantity(item.product.id, item.variation?.id, item.quantity + 1)}
                      onDecrease={() => updateQuantity(item.product.id, item.variation?.id, item.quantity - 1)}
                    />
                  </View>
                )
              })}

              {storePromoDiscount(g.storeId) > 0 && (
                <View style={styles.storePromoRow}>
                  <Text style={styles.storePromoLabel}>🏷️ Promoções (Leve X Pague Y)</Text>
                  <Text style={styles.storePromoValue}>− R$ {storePromoDiscount(g.storeId).toFixed(2)}</Text>
                </View>
              )}
              <View style={styles.storeSubtotalRow}>
                <Text style={styles.storeSubtotalLabel}>Subtotal desta loja</Text>
                <Text style={styles.storeSubtotalValue}>R$ {Math.max(0, storeSubtotal - storePromoDiscount(g.storeId)).toFixed(2)}</Text>
              </View>
            </View>
          )
        })}

        {/* Resumo geral */}
        <View style={styles.totalsCard}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal geral</Text>
            <Text style={styles.totalValue}>R$ {subtotal.toFixed(2)}</Text>
          </View>
          {totalPromo > 0 && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: '#15803D', fontWeight: '700' }]}>Promoções</Text>
              <Text style={[styles.totalValue, { color: '#15803D' }]}>− R$ {totalPromo.toFixed(2)}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Entrega + cupons</Text>
            <Text style={[styles.totalValue, { color: '#9A8880', fontStyle: 'italic' }]}>no checkout</Text>
          </View>
          {stores > 1 && (
            <Text style={styles.multiHint}>
              <Ionicons name="information-circle-outline" size={12} color={colors.textMuted} /> {stores} lojas = {stores} entregas separadas, num pagamento só.
            </Text>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* CTA fixo */}
      <View style={styles.ctaWrap}>
        <TouchableOpacity style={styles.cta} activeOpacity={0.88} onPress={() => router.push('/checkout' as any)}>
          <View style={styles.ctaLeft}><View style={styles.ctaBadge}><Text style={styles.ctaBadgeText}>{count}</Text></View></View>
          <Text style={styles.ctaText}>Ir para o checkout</Text>
          <Text style={styles.ctaPrice}>R$ {netTotal.toFixed(2)}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  scroll: { padding: 16, paddingBottom: 24 },

  emptyContainer: { flex: 1, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIconOuter: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  emptyIconInner: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#FFE0CC', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 8 },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21, marginBottom: 32 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, shadowColor: colors.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 2 },
  topTitle: { fontSize: 13, fontWeight: '800', color: colors.textMuted },
  clearAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 6 },
  clearAllText: { fontSize: 13, fontWeight: '700', color: colors.danger },

  storeCard: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  storeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5EEE9' },
  storeLogoWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  storeName: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  storeClear: { padding: 4 },

  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  itemRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F5EEE9' },
  itemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  itemIconWrap: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#F5F0EC', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  itemDetails: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '700', color: colors.text, lineHeight: 18 },
  itemVariation: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  itemNotes: { fontSize: 11, color: colors.textLight, marginTop: 1, fontStyle: 'italic' },
  itemPrice: { fontSize: 14, fontWeight: '800', color: colors.primary, marginTop: 4 },
  promoPill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, marginTop: 4 },
  promoPillText: { fontSize: 10.5, fontWeight: '800', color: '#15803D' },

  storePromoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10 },
  storePromoLabel: { fontSize: 12, color: '#15803D', fontWeight: '700' },
  storePromoValue: { fontSize: 13, color: '#15803D', fontWeight: '800' },

  storeSubtotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FCFAF8' },
  storeSubtotalLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  storeSubtotalValue: { fontSize: 14, color: colors.text, fontWeight: '800' },

  totalsCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  totalLabel: { fontSize: 14, color: colors.textMuted },
  totalValue: { fontSize: 14, color: colors.text, fontWeight: '700' },
  multiHint: { fontSize: 11.5, color: colors.textMuted, marginTop: 4, lineHeight: 16 },

  ctaWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F0F0F0', padding: 16, paddingBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 16 },
  cta: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 3, borderBottomColor: colors.primaryDark },
  ctaLeft: { width: 32 },
  ctaBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  ctaBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  ctaText: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  ctaPrice: { fontSize: 15, fontWeight: '800', color: 'rgba(255,255,255,0.9)' },
})
