import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image, Modal, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import { api } from '../../src/api/client'
import { LoadError } from '../../src/components/LoadError'

const PRIMARY = '#FF5500'
const TEXT    = '#1A0A00'
const MUTED   = '#7A5C4A'
const BG      = '#FFF8F3'
const CARD    = '#FFFFFF'
const BORDER  = '#F0E8E0'
const GOLD    = '#F59E0B'

interface Review {
  id: string
  rating: number
  comment?: string
  photos?: string[] | null
  createdAt: string
  user: { name: string; avatarUrl?: string }
}

function StarRow({ rating }: { rating: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Ionicons key={i} name={i <= rating ? 'star' : 'star-outline'} size={14} color={GOLD} />
      ))}
    </View>
  )
}

function ReviewCard({ review, onOpenPhoto }: { review: Review; onOpenPhoto: (uri: string) => void }) {
  const initial = review.user.name?.[0]?.toUpperCase() ?? '?'
  const date = new Date(review.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.clientName}>{review.user.name}</Text>
          <Text style={styles.date}>{date}</Text>
        </View>
        <StarRow rating={review.rating} />
      </View>
      {review.comment ? (
        <Text style={styles.comment}>{review.comment}</Text>
      ) : (
        <Text style={[styles.comment, { color: MUTED, fontStyle: 'italic' }]}>Sem comentário</Text>
      )}

      {/* O cliente pode anexar até 3 fotos; o painel web já mostrava e o app não. */}
      {!!review.photos?.length && (
        <View style={styles.photos}>
          {review.photos.map((uri, i) => (
            <TouchableOpacity key={i} onPress={() => onOpenPhoto(uri)} activeOpacity={0.85}>
              <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

export default function StoreReviewsScreen() {
  const insets = useSafeAreaInsets()
  const [reviews, setReviews] = useState<Review[]>([])
  const [avgRating, setAvgRating] = useState<number | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)

  async function fetchReviews(reset = false) {
    // Guard against concurrent pagination calls
    if (!reset && loadingMore) return
    if (!reset) setLoadingMore(true)

    const p = reset ? 1 : page
    if (reset) setLoadError(false)
    try {
      const { data } = await api.get(`/stores/my/reviews?page=${p}`)
      const newList = reset ? data.reviews : [...reviews, ...data.reviews]
      setReviews(newList)
      setAvgRating(data.avgRating)
      setTotal(data.total)
      setHasMore(p < data.pages)
      if (!reset) setPage(p + 1)
      else setPage(2)
    } catch {
      // Só vira tela de erro quando NÃO há nada carregado; falha ao paginar
      // não pode apagar o que o lojista já está vendo.
      if (reset || reviews.length === 0) setLoadError(true)
    }
    setLoading(false)
    setRefreshing(false)
    setLoadingMore(false)
  }

  useFocusEffect(useCallback(() => {
    setLoading(true)
    fetchReviews(true)
  }, []))

  function onRefresh() {
    setRefreshing(true)
    fetchReviews(true)
  }

  const ratingLabel = !avgRating ? '—'
    : avgRating >= 4.5 ? 'Excelente'
    : avgRating >= 3.5 ? 'Muito bom'
    : avgRating >= 2.5 ? 'Bom'
    : 'Regular'

  return (
    <>
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Summary header */}
      <View style={styles.summaryCard}>
        {total > 0 ? (
          <View style={styles.ratingBig}>
            <Text style={styles.ratingNumber}>{avgRating?.toFixed(1) ?? '0.0'}</Text>
            <View>
              <View style={{ flexDirection: 'row', gap: 3 }}>
                {[1,2,3,4,5].map(i => (
                  <Ionicons
                    key={i}
                    name={avgRating && i <= Math.round(avgRating) ? 'star' : 'star-outline'}
                    size={18}
                    color="#fff"
                  />
                ))}
              </View>
              <Text style={styles.ratingLabel}>{ratingLabel}</Text>
              <Text style={styles.ratingCount}>{total} avaliação{total !== 1 ? 'ns' : ''}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.ratingBig}>
            <View style={styles.emptyBadge}>
              <Ionicons name="star" size={28} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.emptyHeadTitle}>Sem avaliações ainda</Text>
              <Text style={styles.emptyHeadSub}>Quando seus clientes avaliarem, a nota média aparece aqui</Text>
            </View>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={PRIMARY} size="large" />
        </View>
      ) : loadError ? (
        <LoadError
          onRetry={() => { setLoading(true); fetchReviews(true) }}
          sub="Não conseguimos buscar as avaliações. Verifique a conexão."
        />
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={r => r.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
          onEndReached={() => { if (hasMore) fetchReviews() }}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="star-outline" size={48} color={PRIMARY} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>Nenhuma avaliação ainda</Text>
              <Text style={styles.emptySub}>As avaliações dos clientes aparecerão aqui</Text>
            </View>
          }
          renderItem={({ item }) => <ReviewCard review={item} onOpenPhoto={setPhoto} />}
        />
      )}
    </View>

      {/* Lightbox — mesma ideia do painel web */}
      <Modal visible={!!photo} transparent animationType="fade" onRequestClose={() => setPhoto(null)}>
        <Pressable style={lb.overlay} onPress={() => setPhoto(null)}>
          {photo && <Image source={{ uri: photo }} style={lb.image} resizeMode="contain" />}
          <View style={lb.closeHint}>
            <Ionicons name="close" size={18} color="#fff" />
            <Text style={lb.closeText}>Toque para fechar</Text>
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  summaryCard: {
    backgroundColor: PRIMARY, paddingHorizontal: 20, paddingVertical: 20,
  },
  ratingBig: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  ratingNumber: { fontSize: 52, fontWeight: '900', color: '#fff', letterSpacing: -2 },
  ratingLabel: { fontSize: 16, fontWeight: '800', color: '#fff', marginTop: 2 },
  ratingCount: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  // Estado vazio do cabeçalho — selo com estrela no lugar do número gigante.
  emptyBadge: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyHeadTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  emptyHeadSub: { fontSize: 12.5, color: 'rgba(255,255,255,0.8)', marginTop: 3, lineHeight: 17 },

  list: { padding: 16, gap: 12 },

  card: {
    backgroundColor: CARD, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#FFF0EB', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: PRIMARY },
  clientName: { fontSize: 14, fontWeight: '800', color: TEXT },
  date: { fontSize: 11, color: MUTED, marginTop: 1 },
  comment: { fontSize: 13, color: TEXT, lineHeight: 20 },
  photos: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  photo: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#F5F0EC' },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: TEXT, marginBottom: 6 },
  emptySub: { fontSize: 14, color: MUTED, textAlign: 'center' },
})

const lb = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  image: { width: '92%', height: '72%' },
  closeHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20 },
  closeText: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' },
})
