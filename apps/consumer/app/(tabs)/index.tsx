import { useState, useEffect, useRef } from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, RefreshControl, ActivityIndicator, ScrollView,
  Dimensions, Image, Modal,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import { api } from '../../src/api/client'
import { colors } from '../../src/theme/colors'
import { useTheme } from '../../src/theme/theme'
import { Store, Category } from '../../src/types'
import { useAuthStore } from '../../src/stores/auth.store'
import { useFavoritesStore } from '../../src/stores/favorites.store'
import { ProductRail } from '../../src/components/ProductRail'

const SLOGAN = 'Entrega na sua casa'

async function fetchUnreadCount(): Promise<number> {
  try {
    const { data } = await api.get<{ count: number }>('/notifications/unread-count')
    return data.count
  } catch {
    return 0
  }
}

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const H_PAD = 16
const GRID_GAP = 12
// Feed é focado em ITENS: grade de produtos (2 no celular, 3 no tablet).
const PRODUCT_COLS = SCREEN_WIDTH >= 600 ? 3 : 2
const CARD_W = Math.floor((SCREEN_WIDTH - H_PAD * 2 - GRID_GAP * (PRODUCT_COLS - 1)) / PRODUCT_COLS)

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

interface FeedProduct {
  id: string
  name: string
  imageUrl?: string | null
  displayPrice: number | null
  store: { id: string; name: string; logoUrl?: string | null; isOpen: boolean; prepTimeMin: number; rating?: number | null; reviewCount?: number }
}

interface FeedFilters { sort?: string; minPrice?: string; maxPrice?: string; minRating?: string }

async function fetchProducts(categoryId?: string, search?: string, filters?: FeedFilters) {
  const params: Record<string, string> = { limit: '60' }
  if (categoryId) params.categoryId = categoryId
  if (search) params.search = search
  if (filters?.sort) params.sort = filters.sort
  if (filters?.minPrice) params.minPrice = filters.minPrice
  if (filters?.maxPrice) params.maxPrice = filters.maxPrice
  if (filters?.minRating) params.minRating = filters.minRating
  const { data } = await api.get<FeedProduct[]>('/products', { params })
  return data
}

const SORT_OPTIONS: { value?: string; label: string }[] = [
  { value: undefined, label: 'Relevância' },
  { value: 'rating', label: 'Melhor avaliação' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
]
const RATING_OPTIONS: { value?: number; label: string }[] = [
  { value: undefined, label: 'Todas' },
  { value: 4, label: '4+' },
  { value: 4.5, label: '4.5+' },
]

async function fetchStores(categoryId?: string, userLat?: number, userLng?: number) {
  const params: Record<string, string> = {}
  if (categoryId) params.categoryId = categoryId
  if (userLat !== undefined) params.userLat = String(userLat)
  if (userLng !== undefined) params.userLng = String(userLng)
  const { data } = await api.get<Store[]>('/stores', { params })
  return data
}

async function fetchCategories() {
  const { data } = await api.get<Category[]>('/stores/categories')
  return data
}

export default function HomeScreen() {
  const { colors: tc } = useTheme()
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(false)
  // Filtros avançados (preço/avaliação/ordenação)
  const [sort, setSort] = useState<string | undefined>()
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [minRating, setMinRating] = useState<number | undefined>()
  const [showFilters, setShowFilters] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | undefined>()
  const user = useAuthStore((s) => s.user)
  const loadFavorites = useFavoritesStore(s => s.load)
  const insets = useSafeAreaInsets()

  // Localização (silenciosa) pra ordenar lojas por proximidade
  useEffect(() => {
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') return
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then(({ coords }) => setUserCoords({ lat: coords.latitude, lng: coords.longitude }))
        .catch(() => {})
    })
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search.trim()), 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })

  const { data: products = [], isLoading, isFetching, refetch, isRefetching } = useQuery({
    queryKey: ['products-feed', selectedCategory, debouncedSearch, sort, minPrice, maxPrice, minRating],
    queryFn: () => fetchProducts(selectedCategory, debouncedSearch || undefined, {
      sort,
      minPrice: minPrice || undefined,
      maxPrice: maxPrice || undefined,
      minRating: minRating != null ? String(minRating) : undefined,
    }),
  })

  // Quantos filtros avançados estão ativos (badge no botão)
  const filtersActive = (sort ? 1 : 0) + (minPrice ? 1 : 0) + (maxPrice ? 1 : 0) + (minRating != null ? 1 : 0)
  function clearFilters() { setSort(undefined); setMinPrice(''); setMaxPrice(''); setMinRating(undefined) }

  const { data: stores = [] } = useQuery({
    queryKey: ['stores-strip', selectedCategory, userCoords?.lat, userCoords?.lng],
    queryFn: () => fetchStores(selectedCategory, userCoords?.lat, userCoords?.lng),
  })

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notif-unread'],
    queryFn: fetchUnreadCount,
    refetchInterval: (query) => {
      const count = query.state.data as number | undefined
      return count && count > 0 ? 30_000 : 120_000
    },
    staleTime: 25_000,
    enabled: !!user,
  })

  useEffect(() => { if (user) loadFavorites() }, [user?.id])

  const isSearching = debouncedSearch.length > 0
  const feed = onlyOpen ? products.filter(p => p.store.isOpen) : products
  const openStores = stores.filter(s => s.isOpen)
  const firstName = user?.name?.split(' ')[0]

  const activeCat = categories?.find(c => c.id === selectedCategory)

  const ListHeader = (
    <View>
      {/* Faixa de LOJAS — secundária (o foco é item). Some na busca. */}
      {!isSearching && stores.length > 0 && (
        <View style={styles.storesStrip}>
          <View style={styles.stripHeader}>
            <Text style={styles.stripTitle}>Lojas</Text>
            <Text style={styles.stripSub}>{openStores.length} aberta{openStores.length !== 1 ? 's' : ''}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripScroll}>
            {stores.map(s => (
              <TouchableOpacity
                key={s.id}
                style={styles.storeChip}
                activeOpacity={0.85}
                onPress={() => router.push(`/store/${s.id}`)}
              >
                <View style={styles.storeLogoWrap}>
                  {s.logoUrl
                    ? <Image source={{ uri: s.logoUrl }} style={styles.storeLogo} resizeMode="cover" />
                    : <View style={styles.storeLogoFallback}><Ionicons name="storefront" size={22} color={colors.primary} /></View>}
                  <View style={[styles.storeDot, { backgroundColor: s.isOpen ? '#22C55E' : '#9CA3AF' }]} />
                </View>
                <Text style={styles.storeChipName} numberOfLines={1}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Ofertas e Destaques — escondidos durante a busca, que tem foco próprio.
          Cada trilho some sozinho quando não tem conteúdo. */}
      {!isSearching && !selectedCategory && (
        <>
          <ProductRail
            rota="/products/offers"
            chave="offers"
            titulo="Ofertas Imperdíveis"
            subtitulo="Preço baixou, aproveite enquanto dura"
            icone="pricetag"
          />
          <ProductRail
            rota="/products/highlights"
            chave="highlights"
            titulo="Destaques da Semana"
            subtitulo="O que mais saiu nos últimos 7 dias"
            icone="sparkles"
          />
        </>
      )}

      {/* Título do feed de ITENS */}
      <View style={styles.feedHeader}>
        {isSearching ? (
          <View style={styles.feedTitleRow}>
            <Text style={styles.feedTitle}>Resultados para </Text>
            <Text style={[styles.feedTitle, { color: colors.primary }]} numberOfLines={1}>"{debouncedSearch}"</Text>
            {isFetching && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 6 }} />}
          </View>
        ) : (
          <>
            <View>
              <Text style={styles.feedTitle}>{activeCat ? activeCat.name : 'Todos os itens'}</Text>
              <Text style={styles.feedSub}>{activeCat ? 'Itens desta categoria' : 'Tudo que as lojas perto de você estão vendendo'}</Text>
            </View>
            <View style={styles.countBadge}><Text style={styles.countText}>{feed.length}</Text></View>
          </>
        )}
      </View>
    </View>
  )

  return (
    <View style={[styles.container, { backgroundColor: tc.bg2 }]}>
      {/* ── Top bar (marca + slogan + busca) ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <View style={styles.topDecor1} />
        <View style={styles.topDecor2} />

        <View style={styles.topBarInner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.brand}>Tá Barato</Text>
            <View style={styles.sloganRow}>
              <Ionicons name="bicycle" size={13} color="rgba(255,255,255,0.9)" />
              <Text style={styles.slogan}>{SLOGAN}</Text>
            </View>
          </View>
          <View style={styles.topBarActions}>
            <TouchableOpacity style={styles.bellBtn} onPress={() => router.push('/notifications')} activeOpacity={0.8}>
              <Ionicons name="notifications-outline" size={20} color="#fff" />
              {unreadCount > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.avatarCircle} onPress={() => router.push('/(tabs)/profile')} activeOpacity={0.85}>
              <Text style={styles.avatarText}>{(firstName?.[0] ?? 'V').toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Saudação + local */}
        <View style={styles.locationRow}>
          <Ionicons name="location-sharp" size={12} color="rgba(255,255,255,0.8)" />
          <Text style={styles.locationText}>
            {firstName ? `Olá, ${firstName} · ` : ''}{user?.city ?? 'Vilhena'}, {user?.state ?? 'RO'}
          </Text>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={17} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="O que você procura hoje?"
            placeholderTextColor={colors.textLight}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.textLight} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Categorias + filtro (barra branca) ── */}
      <View style={[styles.catBar, { backgroundColor: tc.card, borderBottomColor: tc.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll} style={{ flex: 1 }}>
          <TouchableOpacity
            style={[styles.openChip, onlyOpen && styles.openChipActive]}
            onPress={() => setOnlyOpen(v => !v)}
            activeOpacity={0.8}
          >
            <View style={[styles.openDot, { backgroundColor: onlyOpen ? '#fff' : '#22C55E' }]} />
            <Text style={[styles.catText, onlyOpen && styles.catTextActive]}>Abertas</Text>
          </TouchableOpacity>

          {[{ id: '', name: 'Tudo', icon: 'apps-outline' }, ...(categories ?? [])].map((c) => {
            const active = selectedCategory === (c.id || undefined)
            return (
              <TouchableOpacity
                key={c.id || 'all'}
                style={[styles.catChip, active && styles.catChipActive]}
                onPress={() => setSelectedCategory(c.id || undefined)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={((c as any).icon || 'pricetag-outline') as IoniconName}
                  size={13}
                  color={active ? '#fff' : colors.textMuted}
                />
                <Text style={[styles.catText, active && styles.catTextActive]}>{c.name}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* Botão de filtros avançados */}
        <TouchableOpacity
          style={[styles.filterBtn, filtersActive > 0 && styles.filterBtnActive]}
          onPress={() => setShowFilters(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="options-outline" size={18} color={filtersActive > 0 ? '#fff' : colors.textMuted} />
          {filtersActive > 0 && (
            <View style={styles.filterBadge}><Text style={styles.filterBadgeText}>{filtersActive}</Text></View>
          )}
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} size="large" />
      ) : (
        <FlatList
          data={feed}
          key={PRODUCT_COLS}
          numColumns={PRODUCT_COLS}
          columnWrapperStyle={styles.gridRow}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={ListHeader}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="cube-outline" size={38} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Nenhum item encontrado</Text>
              <Text style={styles.emptySub}>Tente outra categoria ou busca</Text>
            </View>
          }
          renderItem={({ item }) => <ProductCard product={item} />}
        />
      )}

      {/* ── Modal de filtros ── */}
      <Modal visible={showFilters} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowFilters(false)}>
        <View style={styles.fOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowFilters(false)} />
          <View style={[styles.fSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.fHandle} />
            <View style={styles.fHeaderRow}>
              <Text style={styles.fTitle}>Filtros</Text>
              {filtersActive > 0 && (
                <TouchableOpacity onPress={clearFilters}><Text style={styles.fClear}>Limpar</Text></TouchableOpacity>
              )}
            </View>

            {/* Ordenar */}
            <Text style={styles.fLabel}>Ordenar por</Text>
            <View style={styles.fChipsWrap}>
              {SORT_OPTIONS.map(o => {
                const active = sort === o.value
                return (
                  <TouchableOpacity key={o.label} style={[styles.fChip, active && styles.fChipActive]} onPress={() => setSort(o.value)} activeOpacity={0.8}>
                    <Text style={[styles.fChipText, active && styles.fChipTextActive]}>{o.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Preço */}
            <Text style={styles.fLabel}>Faixa de preço (R$)</Text>
            <View style={styles.fPriceRow}>
              <TextInput
                style={styles.fPriceInput} value={minPrice} onChangeText={t => setMinPrice(t.replace(/[^\d.]/g, ''))}
                keyboardType="numeric" placeholder="Mín" placeholderTextColor={colors.textLight}
              />
              <Text style={styles.fPriceDash}>até</Text>
              <TextInput
                style={styles.fPriceInput} value={maxPrice} onChangeText={t => setMaxPrice(t.replace(/[^\d.]/g, ''))}
                keyboardType="numeric" placeholder="Máx" placeholderTextColor={colors.textLight}
              />
            </View>

            {/* Avaliação */}
            <Text style={styles.fLabel}>Avaliação da loja</Text>
            <View style={styles.fChipsWrap}>
              {RATING_OPTIONS.map(o => {
                const active = minRating === o.value
                return (
                  <TouchableOpacity key={o.label} style={[styles.fChip, active && styles.fChipActive]} onPress={() => setMinRating(o.value)} activeOpacity={0.8}>
                    {o.value != null && <Ionicons name="star" size={12} color={active ? '#fff' : '#F59E0B'} />}
                    <Text style={[styles.fChipText, active && styles.fChipTextActive]}>{o.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <TouchableOpacity style={styles.fApplyBtn} onPress={() => setShowFilters(false)} activeOpacity={0.85}>
              <Text style={styles.fApplyText}>Ver {feed.length} {feed.length === 1 ? 'item' : 'itens'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function ProductCard({ product }: { product: FeedProduct }) {
  const closed = !product.store.isOpen
  return (
    <TouchableOpacity
      style={[styles.card, { width: CARD_W }]}
      activeOpacity={0.9}
      onPress={() => router.push(`/store/${product.store.id}`)}
    >
      <View style={styles.cardImgWrap}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={styles.cardImg} resizeMode="cover" />
        ) : (
          <View style={styles.cardImgFallback}>
            <Ionicons name="cube-outline" size={34} color={colors.primary} />
          </View>
        )}
        {closed && (
          <View style={styles.closedOverlay}>
            <Text style={styles.closedText}>Fechada</Text>
          </View>
        )}
        {product.store.rating != null && (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={10} color="#F59E0B" />
            <Text style={styles.ratingBadgeText}>{Number(product.store.rating).toFixed(1)}</Text>
          </View>
        )}
        <View style={styles.storeTag}>
          <View style={[styles.storeTagDot, { backgroundColor: closed ? '#9CA3AF' : '#4ADE80' }]} />
          <Text style={styles.storeTagText} numberOfLines={1}>{product.store.name}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={2}>{product.name}</Text>
        <View style={styles.cardBottom}>
          <Text style={styles.cardPrice}>
            {product.displayPrice != null ? `R$ ${Number(product.displayPrice).toFixed(2)}` : 'Ver preços'}
          </Text>
          <View style={styles.addBtn}>
            <Ionicons name="add" size={17} color="#fff" />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  // ── Top bar ──
  topBar: {
    backgroundColor: colors.primary,
    paddingBottom: 16,
    paddingHorizontal: H_PAD,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28, shadowRadius: 10, elevation: 8,
  },
  topDecor1: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)', top: -70, right: -50,
  },
  topDecor2: {
    position: 'absolute', width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.06)', bottom: 10, left: -30,
  },
  topBarInner: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  brand: { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -0.6 },
  sloganRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  slogan: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.92)', letterSpacing: 0.2 },

  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bellBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  bellBadge: {
    position: 'absolute', top: -3, right: -3,
    backgroundColor: '#EF4444', borderRadius: 8,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: '#fff',
  },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#fff' },

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, marginBottom: 12 },
  locationText: { fontSize: 12, color: 'rgba(255,255,255,0.82)', fontWeight: '600' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14,
    paddingHorizontal: 12, height: 46, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 0 },

  // ── Categorias ──
  catBar: { borderBottomWidth: 1, flexGrow: 0, flexDirection: 'row', alignItems: 'center' },
  filterBtn: {
    width: 44, height: 40, marginRight: 10, marginLeft: 2, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#E8E0D8', backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterBadge: {
    position: 'absolute', top: -5, right: -5, backgroundColor: '#EF4444',
    minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: '#fff',
  },
  filterBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  // ── Modal de filtros ──
  fOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  fSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 10,
  },
  fHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E0D8D2', alignSelf: 'center', marginBottom: 14 },
  fHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  fTitle: { fontSize: 19, fontWeight: '900', color: colors.text },
  fClear: { fontSize: 14, fontWeight: '700', color: colors.primary },
  fLabel: { fontSize: 13, fontWeight: '800', color: colors.textMuted, marginTop: 16, marginBottom: 10 },
  fChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#E8E0D8', backgroundColor: '#fff',
  },
  fChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  fChipText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  fChipTextActive: { color: '#fff' },
  fPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fPriceInput: {
    flex: 1, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: '#E8E0D8',
    paddingHorizontal: 14, fontSize: 15, fontWeight: '600', color: colors.text, backgroundColor: '#FAFAFA',
  },
  fPriceDash: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  fApplyBtn: {
    marginTop: 24, height: 52, borderRadius: 14, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  fApplyText: { fontSize: 16, fontWeight: '800', color: '#fff' },

  // ── Rating badge no card ──
  ratingBadge: {
    position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 9, paddingHorizontal: 6, paddingVertical: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 2,
  },
  ratingBadgeText: { fontSize: 10, fontWeight: '800', color: '#1A0A00' },
  catScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
  openChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#E8E0D8', backgroundColor: '#fff',
  },
  openChipActive: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  openDot: { width: 7, height: 7, borderRadius: 4 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E8E0D8',
  },
  catChipActive: {
    backgroundColor: colors.primary, borderColor: colors.primary,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  catText: { fontSize: 13, color: colors.textMuted, fontWeight: '700' },
  catTextActive: { color: '#fff' },

  // ── Faixa de lojas (secundária) ──
  storesStrip: { paddingTop: 16, paddingBottom: 6 },
  stripHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 10 },
  stripTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  stripSub: { fontSize: 12, color: '#9A8880', fontWeight: '600' },
  stripScroll: { gap: 14, paddingRight: 8, paddingBottom: 2 },
  storeChip: { width: 64, alignItems: 'center', gap: 6 },
  storeLogoWrap: { width: 60, height: 60, position: 'relative' },
  storeLogo: { width: 60, height: 60, borderRadius: 18, backgroundColor: '#F0EBE5' },
  storeLogoFallback: {
    width: 60, height: 60, borderRadius: 18, backgroundColor: '#FFF0EB',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#FFD9C2',
  },
  storeDot: {
    position: 'absolute', bottom: -2, right: -2,
    width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: '#F5F5F5',
  },
  storeChipName: { fontSize: 11, fontWeight: '700', color: '#4A3828', textAlign: 'center' },

  // ── Feed header ──
  feedHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 18, paddingBottom: 12, gap: 8,
  },
  feedTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', flex: 1 },
  feedTitle: { fontSize: 18, fontWeight: '900', color: colors.text, letterSpacing: -0.4 },
  feedSub: { fontSize: 12, color: '#9A8880', fontWeight: '600', marginTop: 1 },
  countBadge: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3, minWidth: 26, alignItems: 'center' },
  countText: { fontSize: 12, fontWeight: '800', color: '#fff' },

  // ── Grid de produtos ──
  list: { paddingHorizontal: H_PAD, paddingBottom: 32 },
  gridRow: { gap: GRID_GAP, marginBottom: GRID_GAP },
  card: {
    backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  cardImgWrap: { width: '100%', aspectRatio: 1.15, position: 'relative', backgroundColor: '#F5F0EC' },
  cardImg: { width: '100%', height: '100%' },
  cardImgFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0EB' },
  closedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  closedText: {
    fontSize: 12, fontWeight: '800', color: '#7A5C4A',
    backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: 'hidden',
  },
  storeTag: {
    position: 'absolute', bottom: 6, left: 6, right: 6,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3,
    alignSelf: 'flex-start', maxWidth: '92%',
  },
  storeTagDot: { width: 5, height: 5, borderRadius: 3, flexShrink: 0 },
  storeTagText: { fontSize: 10, fontWeight: '700', color: '#fff', flexShrink: 1 },

  cardBody: { padding: 10 },
  cardName: { fontSize: 13, fontWeight: '800', color: '#1A0A00', lineHeight: 17, marginBottom: 8, minHeight: 34 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardPrice: { fontSize: 15, fontWeight: '900', color: colors.primary, letterSpacing: -0.3, flexShrink: 1 },
  addBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 4,
  },

  // ── Empty ──
  empty: { alignItems: 'center', marginTop: 48, paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 6 },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
})
