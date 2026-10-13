import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useState, useCallback } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../src/api/client'
import { colors } from '../../src/theme/colors'

const BG = '#FFF8F3'
const CARD = '#FFFFFF'
const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const BORDER = '#F0E8E0'

interface Category { id: string; name: string; icon?: string; sortOrder?: number }

// Tinta por categoria — ajuda o olho a distinguir (padrão de apps de comida).
// Tons quentes/suaves ancorados na marca; a 1ª é a laranja da marca.
const TINTS = [
  { bg: '#FFEFE7', fg: '#E14E00' },
  { bg: '#FFF5E0', fg: '#C77D00' },
  { bg: '#E7F5EC', fg: '#0E8A5F' },
  { bg: '#FDE9E9', fg: '#CC3B3B' },
  { bg: '#E8F0FB', fg: '#2E63A6' },
  { bg: '#F2EBFB', fg: '#7A4FC0' },
]

async function fetchCategories(): Promise<Category[]> {
  const { data } = await api.get<Category[]>('/stores/categories')
  return data
}

// Busca ignorando acento e maiúscula ("acai" acha "Açaí").
function norm(s: string) {
  return s.toLowerCase()
    .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
    .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c')
}

export default function CategoriasScreen() {
  const insets = useSafeAreaInsets()
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const { data: categories, isLoading, refetch } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  })

  const q = norm(search.trim())
  const filtered = q ? (categories ?? []).filter((c) => norm(c.name).includes(q)) : (categories ?? [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }, [refetch])

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Text style={styles.title}>Categorias</Text>
        <Text style={styles.subtitle}>Explore as lojas por tipo</Text>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={17} color={MUTED} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar categoria..."
            placeholderTextColor="#BBA898"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color="#BBA898" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name={search ? 'search-outline' : 'apps-outline'} size={44} color={colors.primary} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>{search ? 'Nenhuma categoria encontrada' : 'Nenhuma categoria ainda'}</Text>
              <Text style={styles.emptySub}>
                {search ? `Nada bate com “${search.trim()}”.` : 'As categorias das lojas aparecerão aqui.'}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const tint = TINTS[index % TINTS.length]
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => router.push({ pathname: '/category/[id]', params: { id: item.id, name: item.name } })}
              >
                <View style={[styles.iconWrap, { backgroundColor: tint.bg }]}>
                  <Ionicons name={(item.icon || 'storefront-outline') as any} size={26} color={tint.fg} />
                </View>
                <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
                <View style={styles.cardArrow}>
                  <Text style={styles.cardArrowText}>Ver lojas</Text>
                  <Ionicons name="chevron-forward" size={13} color={MUTED} />
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  title: { fontSize: 26, fontWeight: '900', color: TEXT, letterSpacing: -0.6 },
  subtitle: { fontSize: 13.5, color: MUTED, marginTop: 2 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F5EFEA', borderRadius: 12,
    paddingHorizontal: 12, height: 44, marginTop: 14,
    borderWidth: 1, borderColor: BORDER,
  },
  searchInput: { flex: 1, fontSize: 15, color: TEXT, paddingVertical: 0 },

  grid: { padding: 14 },
  row: { gap: 12 },

  card: {
    flex: 1, backgroundColor: CARD, borderRadius: 18, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  iconWrap: {
    width: 54, height: 54, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  cardName: { fontSize: 15.5, fontWeight: '800', color: TEXT, letterSpacing: -0.2, lineHeight: 20 },
  cardArrow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 8 },
  cardArrowText: { fontSize: 12, fontWeight: '600', color: MUTED },

  empty: { alignItems: 'center', paddingVertical: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: TEXT, marginBottom: 6 },
  emptySub: { fontSize: 13.5, color: MUTED, textAlign: 'center', lineHeight: 19 },
})
