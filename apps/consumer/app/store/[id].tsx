import { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Alert, Image, SectionList, ScrollView, Modal, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../../src/api/client'
import { ProductCard } from '../../src/components/ProductCard'
import { promoLabel } from '../../src/utils/promo'
import { colors } from '../../src/theme/colors'
import { useCartStore } from '../../src/stores/cart.store'
import { Store, Product, ProductVariation } from '../../src/types'
import { AppAlert } from '../../src/components/AppAlert'

const PRIMARY = '#FF5500'
const PRIMARY_DARK = '#CC3300'
const PRIMARY_LIGHT = '#FFF0EB'
const TEXT = '#1A0A00'
const MUTED = '#9A8880'
const BORDER = '#F0E8E2'
const CARD = '#FFFFFF'

interface Review {
  id: string
  rating: number
  comment?: string
  photos: string[]
  createdAt: string
  user: { id: string; name: string; avatarUrl?: string }
}

interface ReviewsData {
  reviews: Review[]
  total: number
  avgRating: number | null
}

async function fetchStore(id: string) {
  const { data } = await api.get<Store & { products: Product[] }>(`/stores/${id}`)
  return data
}

async function fetchReviews(storeId: string) {
  const { data } = await api.get<ReviewsData>(`/reviews/store/${storeId}?limit=5`)
  return data
}

/**
 * Lojas cuja mensagem de "esta fechada" o cliente ja viu nesta sessao.
 *
 * O aviso existe para ele decidir, nao para repetir a cada item: avisar de novo
 * no segundo produto da mesma loja vira obstaculo. Fica fora do componente de
 * proposito, para sobreviver a sair da loja e voltar.
 */
const lojasAvisadas = new Set<string>()

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Ionicons
          key={s}
          name={s <= rating ? 'star' : s - 0.5 <= rating ? 'star-half' : 'star-outline'}
          size={size}
          color={s <= rating ? '#F59E0B' : '#E5DDD8'}
        />
      ))}
    </View>
  )
}

function ReviewCard({ review }: { review: Review }) {
  const userName = review.user?.name ?? 'Usuário'
  const initials = userName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  const date = new Date(review.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

  return (
    <View style={rStyles.card}>
      <View style={rStyles.header}>
        <View style={rStyles.avatar}>
          <Text style={rStyles.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={rStyles.name}>{userName.split(' ')[0]}</Text>
          <StarRow rating={review.rating} size={13} />
        </View>
        <Text style={rStyles.date}>{date}</Text>
      </View>
      {review.comment ? <Text style={rStyles.comment}>{review.comment}</Text> : null}
      {review.photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={rStyles.photosRow}>
          {review.photos.map((url) => (
            <Image key={url} source={{ uri: url }} style={rStyles.photo} />
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const rStyles = StyleSheet.create({
  card: { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: BORDER },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: PRIMARY_LIGHT, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '800', color: PRIMARY },
  name: { fontSize: 13, fontWeight: '700', color: TEXT, marginBottom: 2 },
  date: { fontSize: 11, color: MUTED },
  comment: { fontSize: 13, color: TEXT, lineHeight: 19, fontWeight: '400' },
  photosRow: { marginTop: 10 },
  photo: { width: 80, height: 80, borderRadius: 10, marginRight: 8 },
})

function ProductDetailModal({
  product, storeId, storeName, visible, onClose, aoAdicionar,
}: {
  product: Product | null
  storeId: string
  storeName: string
  visible: boolean
  onClose: () => void
  /** Intercala o aviso de loja fechada antes de adicionar de fato. */
  aoAdicionar: (acao: () => void) => void
}) {
  const insets = useSafeAreaInsets()
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')

  const addItem = useCartStore((s) => s.addItem)

  useEffect(() => {
    if (visible) {
      setSelectedVariation(null)
      setQuantity(1)
      setNotes('')
    }
  }, [visible, product?.id])

  if (!product) return null

  const hasVariations = product.hasVariations && product.variations.length > 0
  const basePrice = hasVariations
    ? Math.min(...product.variations.map((v) => Number(v.price)))
    : Number(product.basePrice ?? 0)
  const activePrice = selectedVariation ? Number(selectedVariation.price) : basePrice
  const priceLabel = selectedVariation
    ? `R$ ${activePrice.toFixed(2)}`
    : hasVariations
    ? `A partir de R$ ${activePrice.toFixed(2)}`
    : `R$ ${activePrice.toFixed(2)}`

  // estoque null = ilimitado; <= 0 = esgotado
  const stockOut = (s?: number | null) => s != null && s <= 0
  // Bloqueia se: tem variações mas nenhuma escolhida, variação escolhida esgotada,
  // ou produto sem variação com estoque zerado
  const variationOutOfStock = selectedVariation != null && stockOut(selectedVariation.stock)
  const productOutOfStock = !hasVariations && stockOut(product.stock)
  const allVariationsOut = hasVariations && product.variations.every((v) => stockOut(v.stock))
  const canAdd =
    (!hasVariations || selectedVariation != null) &&
    !variationOutOfStock && !productOutOfStock && !allVariationsOut

  function doAdd() {
    aoAdicionar(() => {
      addItem(storeId, storeName, product!, selectedVariation ?? undefined, quantity, notes.trim() || undefined)
    })
    onClose()
  }

  function handleAdd() {
    if (!canAdd) return
    // Multi-loja: pode juntar itens de várias lojas no mesmo carrinho.
    doAdd()
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView style={det.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Drag handle */}
        <View style={det.handle}>
          <View style={det.handleBar} />
        </View>
        <TouchableOpacity style={det.closeBtn} onPress={onClose} activeOpacity={0.8}>
          <Ionicons name="close" size={20} color={TEXT} />
        </TouchableOpacity>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 140 }}>
          {/* Image */}
          {product.imageUrl ? (
            <Image source={{ uri: product.imageUrl }} style={det.image} resizeMode="cover" />
          ) : (
            <View style={det.imagePlaceholder}>
              <Ionicons name="cube-outline" size={64} color={PRIMARY} />
            </View>
          )}

          <View style={det.content}>
            {/* Category badge */}
            {product.category?.name ? (
              <View style={det.catBadge}>
                <Text style={det.catText}>{product.category.name}</Text>
              </View>
            ) : null}

            {/* Name */}
            <Text style={det.name}>{product.name}</Text>

            {/* Price */}
            <Text style={det.price}>{priceLabel}</Text>

            {/* Promoção Leve X Pague Y */}
            {promoLabel(product.promoBuyQty, product.promoPayQty) && (
              <View style={det.promoBanner}>
                <Ionicons name="pricetag" size={15} color="#15803D" />
                <Text style={det.promoBannerText}>
                  {promoLabel(product.promoBuyQty, product.promoPayQty)} — leve {product.promoBuyQty} unidades e pague só {product.promoPayQty}!
                </Text>
              </View>
            )}

            {/* Description */}
            {product.description ? (
              <View style={det.section}>
                <Text style={det.sectionLabel}>DESCRIÇÃO</Text>
                <Text style={det.description}>{product.description}</Text>
              </View>
            ) : null}

            {/* Variations */}
            {hasVariations && (
              <View style={det.section}>
                <Text style={det.sectionLabel}>
                  OPÇÕES{selectedVariation ? ` · ${selectedVariation.name}` : ' · selecione uma'}
                </Text>
                <View style={det.variationsWrap}>
                  {product.variations.map((v) => {
                    const isSelected = selectedVariation?.id === v.id
                    const vOut = stockOut(v.stock)
                    return (
                      <TouchableOpacity
                        key={v.id}
                        style={[det.varChip, isSelected && det.varChipActive, vOut && det.varChipOut]}
                        onPress={() => { if (!vOut) setSelectedVariation(isSelected ? null : v) }}
                        disabled={vOut}
                        activeOpacity={0.8}
                      >
                        <Text style={[det.varChipName, isSelected && det.varChipNameActive]}>
                          {v.name}{vOut ? ' · esgotado' : ''}
                        </Text>
                        {(v.size || v.color) && (
                          <Text style={[det.varChipSub, isSelected && { color: PRIMARY }]}>
                            {[v.size, v.color].filter(Boolean).join(' · ')}
                          </Text>
                        )}
                        <Text style={[det.varChipPrice, isSelected && { color: PRIMARY, fontWeight: '800' }]}>
                          R$ {Number(v.price).toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            )}

            {/* Quantity */}
            <View style={det.section}>
              <Text style={det.sectionLabel}>QUANTIDADE</Text>
              <View style={det.qtyRow}>
                <TouchableOpacity
                  style={[det.qtyBtn, quantity <= 1 && det.qtyBtnDisabled]}
                  onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  activeOpacity={0.8}
                >
                  <Ionicons name="remove" size={18} color={quantity <= 1 ? MUTED : PRIMARY} />
                </TouchableOpacity>
                <Text style={det.qtyNum}>{quantity}</Text>
                <TouchableOpacity
                  style={det.qtyBtn}
                  onPress={() => setQuantity((q) => q + 1)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add" size={18} color={PRIMARY} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Observações do item — DENTRO do scroll pra dar pra rolar até ele
              (antes ficava atrás do rodapé absoluto e o botão cobria). */}
          <View style={det.notesWrap}>
            <Text style={det.notesLabel}>Observações (opcional)</Text>
            <TextInput
              style={det.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Ex: sem cebola, ponto médio, extra queijo..."
              placeholderTextColor="#C0B0A8"
              multiline
              numberOfLines={2}
              maxLength={200}
            />
          </View>
        </ScrollView>

        {/* Fixed bottom CTA */}
        <View style={[det.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[det.addBtn, !canAdd && { opacity: 0.55 }]}
            onPress={handleAdd}
            disabled={!canAdd}
            activeOpacity={0.85}
          >
            <View style={det.addBtnInner}>
              <Ionicons name="cart-outline" size={20} color="#fff" />
              <Text style={det.addBtnText}>
                {productOutOfStock || allVariationsOut
                  ? 'Produto esgotado'
                  : variationOutOfStock
                  ? 'Variação esgotada'
                  : canAdd
                  ? `Adicionar · R$ ${(activePrice * quantity).toFixed(2)}`
                  : 'Selecione uma opção'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const det = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF6F2' },
  handle: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E0D8D0' },
  closeBtn: {
    position: 'absolute', top: 10, right: 14, zIndex: 10,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(240,235,229,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  image: { width: '100%', height: 260 },
  imagePlaceholder: {
    width: '100%', height: 220,
    backgroundColor: PRIMARY_LIGHT,
    alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: 20, paddingTop: 16 },
  catBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0EBE5', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, marginBottom: 10,
  },
  catText: { fontSize: 11, fontWeight: '700', color: '#7A6A60', letterSpacing: 0.3 },
  name: { fontSize: 22, fontWeight: '900', color: TEXT, lineHeight: 28, marginBottom: 10 },
  price: { fontSize: 26, fontWeight: '900', color: PRIMARY, marginBottom: 12, letterSpacing: -0.5 },
  promoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#DCFCE7', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 20,
  },
  promoBannerText: { flex: 1, fontSize: 13, fontWeight: '800', color: '#15803D', lineHeight: 17 },
  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.6, marginBottom: 12 },
  description: { fontSize: 14, color: TEXT, lineHeight: 22 },
  variationsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  varChip: {
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: CARD, minWidth: 90, alignItems: 'center',
  },
  varChipActive: { borderColor: PRIMARY, backgroundColor: PRIMARY_LIGHT },
  varChipOut: { opacity: 0.45, backgroundColor: '#F5F0EC' },
  varChipName: { fontSize: 14, fontWeight: '800', color: TEXT },
  varChipNameActive: { color: PRIMARY },
  varChipSub: { fontSize: 11, color: MUTED, marginTop: 3 },
  varChipPrice: { fontSize: 13, fontWeight: '600', color: MUTED, marginTop: 5 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  qtyBtn: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: PRIMARY_LIGHT, borderWidth: 1, borderColor: '#FFD4BA',
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnDisabled: { backgroundColor: '#F5F5F5', borderColor: BORDER },
  qtyNum: { fontSize: 22, fontWeight: '900', color: TEXT, minWidth: 32, textAlign: 'center' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, paddingBottom: 28,
    backgroundColor: '#FAF6F2',
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  addBtn: {
    borderRadius: 14,
    shadowColor: PRIMARY_DARK,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  addBtnInner: {
    backgroundColor: PRIMARY,
    borderRadius: 14, paddingVertical: 17,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderBottomWidth: 3, borderBottomColor: PRIMARY_DARK,
  },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  notesWrap: { paddingHorizontal: 20, paddingBottom: 12 },
  notesLabel: { fontSize: 12, fontWeight: '700', color: '#9A8880', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  notesInput: {
    backgroundColor: '#F5F0EC', borderRadius: 12, borderWidth: 1.5, borderColor: '#EDE5DF',
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#1A0A00',
    minHeight: 64, textAlignVertical: 'top',
  },
})

export default function StoreScreen() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: store, isLoading } = useQuery({
    queryKey: ['store', id],
    queryFn: () => fetchStore(id),
  })
  const { data: reviewsData } = useQuery({
    queryKey: ['store-reviews', id],
    queryFn: () => fetchReviews(id),
    enabled: !!id,
  })

  const addItem = useCartStore((s) => s.addItem)
  const itemCount = useCartStore((s) => s.itemCount())

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  // Acao segurada esperando o cliente confirmar que viu o aviso de loja
  // fechada. null = sem aviso na tela.
  const [acaoPendente, setAcaoPendente] = useState<null | { run: () => void }>(null)

  /**
   * Adiciona ao carrinho, intercalando o aviso quando a loja esta fechada e o
   * cliente ainda nao foi avisado dela nesta sessao.
   */
  function comAvisoSeFechada(acao: () => void) {
    if (store && !store.isOpen && !lojasAvisadas.has(id)) {
      lojasAvisadas.add(id)
      setAcaoPendente({ run: acao })
      return
    }
    acao()
  }

  function handleAddProduct(product: Product) {
    // Multi-loja: pode juntar itens de várias lojas no mesmo carrinho.
    comAvisoSeFechada(() => addItem(id, store!.name, product))
  }

  if (isLoading || !store) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  const categories = Array.from(
    new Map(store.products.map((p) => [p.category.id, p.category])).values(),
  )
  const normalizeStr = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = normalizeStr(searchQuery.trim())
  const sections = categories.map((cat) => ({
    title: cat.name,
    data: store.products.filter((p) => {
      if (p.category.id !== cat.id) return false
      if (!q) return true
      return normalizeStr(p.name).includes(q) || normalizeStr(p.description ?? '').includes(q)
    }),
  })).filter((s) => s.data.length > 0)

  const avg = reviewsData?.avgRating
  const totalReviews = reviewsData?.total ?? 0

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            {/* Banner */}
            <View style={styles.bannerWrap}>
              {store.logoUrl ? (
                <Image source={{ uri: store.logoUrl }} style={styles.banner} />
              ) : (
                <View style={[styles.banner, styles.bannerPlaceholder]}>
                  <Text style={styles.bannerText}>{store.name[0]}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[styles.backBtn, { top: insets.top + 10 }]}
                onPress={() => router.back()}
                activeOpacity={0.85}
              >
                <Ionicons name="arrow-back" size={20} color="#1A0A00" />
              </TouchableOpacity>
            </View>

            {/* Store info */}
            <View style={styles.storeInfo}>
              <Text style={styles.storeName}>{store.name}</Text>
              {store.description && <Text style={styles.storeDesc}>{store.description}</Text>}
              <View style={styles.storeMeta}>
                <View style={[styles.statusBadge, { backgroundColor: store.isOpen ? PRIMARY_LIGHT : '#FEE2E2' }]}>
                  <Text style={{ color: store.isOpen ? PRIMARY : '#DC2626', fontWeight: '700', fontSize: 12 }}>
                    {store.isOpen ? '● Aberto' : '● Fechado'}
                  </Text>
                </View>
                <Text style={styles.metaText}>⏱ {store.prepTimeMin} min</Text>
                {avg !== null && avg !== undefined && (
                  <View style={styles.ratingPill}>
                    <Ionicons name="star" size={12} color="#F59E0B" />
                    <Text style={styles.ratingPillText}>{avg.toFixed(1)}</Text>
                    <Text style={styles.ratingPillCount}>({totalReviews})</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Reviews section */}
            {totalReviews > 0 && (
              <View style={styles.reviewsSection}>
                <View style={styles.reviewsSummary}>
                  <View style={styles.avgBlock}>
                    <Text style={styles.avgNumber}>{avg?.toFixed(1)}</Text>
                    <StarRow rating={Math.round(avg ?? 0)} size={16} />
                    <Text style={styles.avgCount}>{totalReviews} avaliação{totalReviews !== 1 ? 'ões' : ''}</Text>
                  </View>
                  <View style={styles.barsBlock}>
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = reviewsData?.reviews.filter((r) => r.rating === star).length ?? 0
                      const pct = totalReviews > 0 ? (count / totalReviews) * 100 : 0
                      return (
                        <View key={star} style={styles.barRow}>
                          <Text style={styles.barLabel}>{star}</Text>
                          <Ionicons name="star" size={10} color="#F59E0B" />
                          <View style={styles.barTrack}>
                            <View style={[styles.barFill, { width: `${pct}%` }]} />
                          </View>
                        </View>
                      )
                    })}
                  </View>
                </View>
                <Text style={styles.reviewsTitle}>Avaliações recentes</Text>
                {reviewsData?.reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
              </View>
            )}

            {store.products.length > 0 && (
              <>
                <View style={styles.searchWrap}>
                  <Ionicons name="search-outline" size={18} color={searchQuery ? PRIMARY : MUTED} />
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Buscar na loja..."
                    placeholderTextColor={MUTED}
                    returnKeyType="search"
                    autoCorrect={false}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
                      <Ionicons name="close-circle" size={18} color={MUTED} />
                    </TouchableOpacity>
                  )}
                </View>
                {!searchQuery && (
                  <View style={styles.productsHeader}>
                    <Text style={styles.productsTitle}>Produtos</Text>
                  </View>
                )}
              </>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.productWrapper}>
            <ProductCard
              product={item}
              onAdd={handleAddProduct}
              onPress={() => setSelectedProduct(item)}
            />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: itemCount > 0 ? 90 : 20 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            {searchQuery ? (
              <>
                <Ionicons name="search-outline" size={38} color={MUTED} />
                <Text style={styles.emptyTitle}>Nenhum resultado</Text>
                <Text style={styles.emptyText}>para "{searchQuery}"</Text>
              </>
            ) : (
              <Text style={styles.emptyText}>Esta loja ainda não tem produtos</Text>
            )}
          </View>
        }
      />

      {itemCount > 0 && (
        <View style={[styles.cartBar, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.cartBtn} onPress={() => router.push('/cart')}>
            <View style={styles.cartCount}>
              <Text style={styles.cartCountText}>{itemCount}</Text>
            </View>
            <Text style={styles.cartBtnText}>Ver carrinho</Text>
            <Text style={styles.cartBtnText}>›</Text>
          </TouchableOpacity>
        </View>
      )}

      <ProductDetailModal
        visible={!!selectedProduct}
        product={selectedProduct}
        storeId={id}
        storeName={store.name}
        onClose={() => setSelectedProduct(null)}
        aoAdicionar={comAvisoSeFechada}
      />

      {/* Loja fechada: o cliente monta o pedido do mesmo jeito, so precisa
          saber que a loja so vai ver quando abrir. */}
      <AppAlert
        visible={!!acaoPendente}
        type="info"
        title={`${store.name} esta fechada agora`}
        message={
          'Voce pode montar seu pedido normalmente. Ele fica guardado no carrinho e '
          + 'a loja so vai receber quando abrir.'
        }
        confirmText="Entendi, adicionar"
        cancelText="Agora nao"
        onConfirm={() => { acaoPendente?.run(); setAcaoPendente(null) }}
        onClose={() => {
          // Desistiu: deixa a loja poder avisar de novo, senao a proxima
          // tentativa adicionaria calado.
          lojasAvisadas.delete(id)
          setAcaoPendente(null)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  bannerWrap: { position: 'relative' },
  banner: { width: '100%', height: 180 },
  bannerPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: PRIMARY_LIGHT },
  bannerText: { fontSize: 56, fontWeight: '700', color: PRIMARY },
  backBtn: {
    position: 'absolute',
    left: 14,
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },

  storeInfo: { padding: 16, paddingBottom: 12 },
  storeName: { fontSize: 22, fontWeight: '800', color: TEXT, marginBottom: 4 },
  storeDesc: { fontSize: 13, color: MUTED, marginBottom: 10, lineHeight: 19 },
  storeMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  metaText: { fontSize: 13, color: MUTED },
  ratingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFFBEB', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  ratingPillText: { fontSize: 12, fontWeight: '800', color: '#92400E' },
  ratingPillCount: { fontSize: 11, color: MUTED },

  reviewsSection: { paddingHorizontal: 16, paddingBottom: 8 },
  reviewsSummary: {
    flexDirection: 'row', gap: 16, alignItems: 'flex-start',
    backgroundColor: CARD, borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: BORDER,
  },
  avgBlock: { alignItems: 'center', gap: 4, minWidth: 70 },
  avgNumber: { fontSize: 36, fontWeight: '900', color: TEXT, letterSpacing: -1 },
  avgCount: { fontSize: 11, color: MUTED, fontWeight: '600', textAlign: 'center' },
  barsBlock: { flex: 1, gap: 5 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  barLabel: { fontSize: 11, color: MUTED, fontWeight: '700', width: 10, textAlign: 'right' },
  barTrack: { flex: 1, height: 6, backgroundColor: '#F0E8E2', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#F59E0B', borderRadius: 3 },
  reviewsTitle: { fontSize: 14, fontWeight: '800', color: TEXT, marginBottom: 10 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 16, marginBottom: 4,
    backgroundColor: CARD, borderRadius: 14,
    borderWidth: 1.5, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  searchInput: {
    flex: 1, fontSize: 14, color: TEXT, fontWeight: '500', padding: 0,
  },

  productsHeader: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  productsTitle: { fontSize: 18, fontWeight: '800', color: TEXT },

  sectionHeader: {
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: colors.background,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: TEXT },
  productWrapper: { paddingHorizontal: 16 },
  empty: { alignItems: 'center', padding: 40, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: TEXT, marginTop: 8 },
  emptyText: { color: MUTED, fontSize: 14 },

  cartBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16 },
  cartBtn: {
    backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  cartCount: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2, marginRight: 10,
  },
  cartCountText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  cartBtnText: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 16 },
})
