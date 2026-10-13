import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../src/api/client'
import { colors } from '../../src/theme/colors'
import { StoreCard } from '../../src/components/StoreCard'
import { Store } from '../../src/types'

const BG = '#FFF8F3'
const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const BORDER = '#F0E8E0'

async function fetchStoresByCategory(categoryId: string): Promise<Store[]> {
  const { data } = await api.get<Store[]>('/stores', { params: { categoryId } })
  return data
}

export default function CategoryStoresScreen() {
  const insets = useSafeAreaInsets()
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>()

  const { data: stores, isLoading } = useQuery({
    queryKey: ['stores-by-category', id],
    queryFn: () => fetchStoresByCategory(id),
    enabled: !!id,
  })

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color={TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{name ?? 'Categoria'}</Text>
        <View style={{ width: 38 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={stores ?? []}
          keyExtractor={(s) => s.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            (stores?.length ?? 0) > 0
              ? <Text style={styles.count}>{stores!.length} loja{stores!.length !== 1 ? 's' : ''}</Text>
              : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="storefront-outline" size={44} color={colors.primary} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>Nenhuma loja nesta categoria</Text>
              <Text style={styles.emptySub}>Ainda não há lojas em {name ?? 'nesta categoria'}. Volte em breve!</Text>
            </View>
          }
          renderItem={({ item }) => (
            <StoreCard store={item} onPress={() => router.push(`/store/${item.id}`)} />
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingBottom: 12,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: '#F5EFEA',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: TEXT, letterSpacing: -0.3 },
  list: { padding: 16, gap: 14 },
  count: { fontSize: 13, color: MUTED, fontWeight: '600', marginBottom: 4 },
  empty: { alignItems: 'center', paddingVertical: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: TEXT, marginBottom: 6 },
  emptySub: { fontSize: 13.5, color: MUTED, textAlign: 'center', lineHeight: 19 },
})
