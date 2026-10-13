import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Store } from '../types'
import { colors } from '../theme/colors'
import { useFavoritesStore } from '../stores/favorites.store'
import { useAuthStore } from '../stores/auth.store'

interface Props {
  store: Store
  onPress: () => void
}

export function StoreCard({ store, onPress }: Props) {
  const cats = (store.categories ?? []).map((c) => c.name).join(' · ')
  const isFavorite = useFavoritesStore(s => s.isFavorite(store.id))
  const toggle = useFavoritesStore(s => s.toggle)
  const user = useAuthStore(s => s.user)

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.92}>
      {/* Banner */}
      <View style={styles.banner}>
        {store.logoUrl ? (
          <Image source={{ uri: store.logoUrl }} style={styles.bannerImg} resizeMode="cover" />
        ) : (
          <View style={styles.bannerPlaceholder}>
            <View style={styles.bannerDecor1} />
            <View style={styles.bannerDecor2} />
            <Text style={styles.bannerInitial}>{store.name[0]}</Text>
          </View>
        )}

        {!store.isOpen && (
          <View style={styles.closedOverlay}>
            <Text style={styles.closedLabel}>Fechado</Text>
          </View>
        )}

        {store.isOpen && (
          <View style={styles.openBadge}>
            <View style={styles.openDot} />
            <Text style={styles.openText}>Aberto agora</Text>
          </View>
        )}

        {/* Favorite heart — only for logged-in users */}
        {user && (
          <TouchableOpacity
            style={styles.heartBtn}
            onPress={() => toggle(store.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={20}
              color={isFavorite ? '#EF4444' : '#fff'}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Body */}
      <View style={styles.body}>
        <View style={styles.logoRow}>
          <View style={styles.logoWrap}>
            {store.logoUrl ? (
              <Image source={{ uri: store.logoUrl }} style={styles.logo} />
            ) : (
              <View style={[styles.logo, styles.logoFallback]}>
                <Text style={styles.logoInitial}>{store.name[0]}</Text>
              </View>
            )}
          </View>
          <View style={styles.titleWrap}>
            <Text style={styles.name} numberOfLines={1}>{store.name}</Text>
            {cats ? <Text style={styles.cats} numberOfLines={1}>{cats}</Text> : null}
          </View>
          {store.rating != null && store.rating > 0 && (
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={11} color="#F59E0B" />
              <Text style={styles.ratingText}>{store.rating.toFixed(1)}</Text>
            </View>
          )}
        </View>

        <View style={styles.metaRow}>
          <View style={styles.pill}>
            <Text style={styles.pillIcon}>⏱</Text>
            <Text style={styles.pillText}>{store.prepTimeMin} min</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.pill}>
            <Text style={styles.pillIcon}>📍</Text>
            <Text style={styles.pillText}>{store.deliveryRadiusKm} km</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.pill}>
            <Text style={styles.pillIcon}>🛵</Text>
            <Text style={styles.pillText}>Entrega disponível</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 3,
  },

  banner: {
    height: 130,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  bannerImg: { width: '100%', height: '100%' },
  bannerPlaceholder: {
    flex: 1,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bannerDecor1: {
    position: 'absolute',
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -40, right: -30,
  },
  bannerDecor2: {
    position: 'absolute',
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.06)',
    bottom: -20, left: 20,
  },
  bannerInitial: { fontSize: 52, fontWeight: '900', color: 'rgba(255,255,255,0.35)' },

  closedOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center', justifyContent: 'center',
  },
  closedLabel: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },

  openBadge: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, gap: 5,
  },
  openDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E' },
  openText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  heartBtn: {
    position: 'absolute', top: 10, left: 10,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },

  body: { padding: 12, paddingTop: 10 },

  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  logoWrap: {
    width: 48, height: 48, borderRadius: 12,
    borderWidth: 2, borderColor: colors.border,
    overflow: 'hidden', marginRight: 10,
    backgroundColor: colors.primaryLight,
  },
  logo: { width: '100%', height: '100%' },
  logoFallback: { alignItems: 'center', justifyContent: 'center' },
  logoInitial: { fontSize: 20, fontWeight: '800', color: colors.primary },

  titleWrap: { flex: 1 },
  name: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 2 },
  cats: { fontSize: 12, color: colors.textMuted },

  ratingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FEF3C7', borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  ratingText: { fontSize: 12, fontWeight: '800', color: '#92400E' },

  metaRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 6,
  },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pillIcon: { fontSize: 11 },
  pillText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
  separator: { width: 1, height: 12, backgroundColor: colors.border, marginHorizontal: 2 },
})
