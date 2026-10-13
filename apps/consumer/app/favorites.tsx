import { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../src/api/client'
import { StoreCard } from '../src/components/StoreCard'
import { colors } from '../src/theme/colors'
import { LoadError } from '../src/components/LoadError'

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets()
  const [stores, setStores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // Falha de rede tem que parecer falha, não "você não tem favoritos".
  function load() {
    setLoading(true); setLoadError(false)
    api.get('/users/me/favorites')
      .then(r => setStores(r.data.map((f: any) => f.store)))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color="#1A0A00" />
        </TouchableOpacity>
        <Text style={styles.title}>Favoritos</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} size="large" />
      ) : loadError ? (
        <LoadError onRetry={load} />
      ) : stores.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="heart-outline" size={56} color={colors.primary} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>Nenhuma loja favorita</Text>
          <Text style={styles.emptySub}>Toque no coração em qualquer loja para salvá-la aqui</Text>
          <TouchableOpacity style={styles.discoverBtn} onPress={() => router.push('/(tabs)')} activeOpacity={0.85}>
            <Text style={styles.discoverText}>Descobrir lojas</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={stores}
          keyExtractor={s => s.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <StoreCard store={item} onPress={() => router.push(`/store/${item.id}`)} />
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF8F3' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F0E8E0',
    backgroundColor: '#fff',
  },
  backBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#F5F0EC', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '900', color: '#1A0A00' },
  list: { padding: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: '#1A0A00', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#7A5C4A', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  discoverBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28 },
  discoverText: { color: '#fff', fontSize: 15, fontWeight: '800' },
})
