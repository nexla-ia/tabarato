import { Tabs, router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../../src/theme/colors'
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLojistaStore } from '../../src/stores/lojista.store'
import { useAuthStore } from '../../src/stores/auth.store'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../src/api/client'
import { PendingReview } from '../../src/components/PendingReview'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

function TabIcon({ name, focused }: { name: IoniconName; focused: boolean }) {
  return (
    <View style={tab.iconWrap}>
      <Ionicons name={name} size={22} color={focused ? colors.primary : '#AAAAAA'} />
    </View>
  )
}

function NotificationBell() {
  const [unread, setUnread] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function fetchCount() {
    try {
      const { data } = await api.get<{ count: number }>('/notifications/unread-count')
      setUnread(data.count ?? 0)
    } catch {}
  }

  useFocusEffect(
    useCallback(() => {
      fetchCount()
      intervalRef.current = setInterval(fetchCount, 30_000)
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    }, []),
  )

  return (
    <TouchableOpacity
      onPress={() => router.navigate('/notifications')}
      activeOpacity={0.75}
      style={bell.btn}
    >
      <Ionicons name={unread > 0 ? 'notifications' : 'notifications-outline'} size={22} color="#fff" />
      {unread > 0 && (
        <View style={bell.badge}>
          <Text style={bell.badgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

function HeaderAvatar() {
  const user = useAuthStore((s) => s.user)
  const initial = user?.name?.[0]?.toUpperCase() ?? 'L'

  return (
    <TouchableOpacity
      onPress={() => router.navigate('/(store-tabs)/store')}
      activeOpacity={0.75}
      style={avatar.btn}
    >
      {user?.avatarUrl ? (
        <Image source={{ uri: user.avatarUrl }} style={avatar.img} />
      ) : (
        <View style={avatar.circle}>
          <Text style={avatar.text}>{initial}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

function PendingTabIcon({ focused }: { focused: boolean }) {
  const count = useLojistaStore((s) => s.pendingCount)
  const setPendingCount = useLojistaStore((s) => s.setPendingCount)

  // Poll pending count every 30s so the badge stays fresh on any tab
  useFocusEffect(
    useCallback(() => {
      let alive = true
      async function poll() {
        try {
          const { data } = await api.get('/orders/store')
          if (alive) setPendingCount(data.filter((o: any) => o.status === 'PENDING').length)
        } catch {}
      }
      poll()
      const id = setInterval(poll, 30_000)
      return () => { alive = false; clearInterval(id) }
    }, [setPendingCount]),
  )

  return (
    <View style={tab.iconWrap}>
      <Ionicons
        name={focused ? 'receipt' : 'receipt-outline'}
        size={22}
        color={focused ? colors.primary : '#AAAAAA'}
      />
      {count > 0 && (
        <View style={badge.dot}>
          <Text style={badge.text}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </View>
  )
}

const bell = StyleSheet.create({
  btn: {
    marginLeft: 10, padding: 4,
    position: 'relative', alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    position: 'absolute', top: -1, right: -3,
    backgroundColor: '#EF4444',
    borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: colors.primary,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
})

const avatar = StyleSheet.create({
  btn: { marginRight: 14, padding: 2 },
  img: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' },
  circle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  text: { color: '#fff', fontSize: 14, fontWeight: '800' },
})

const tab = StyleSheet.create({
  iconWrap: {
    alignItems: 'center', justifyContent: 'center',
    width: 40, height: 28,
    position: 'relative',
  },
})

const badge = StyleSheet.create({
  dot: {
    position: 'absolute', top: -3, right: -5,
    backgroundColor: colors.danger,
    borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: '#fff',
  },
  text: { color: '#fff', fontSize: 9, fontWeight: '800' },
})

export default function StoreTabsLayout() {
  const insets = useSafeAreaInsets()

  // Trava: o lojista só acessa o painel quando a loja está APROVADA. Enquanto
  // pendente/rejeitada, mostra a tela de análise (que faz polling e libera
  // sozinha quando o admin aprova).
  const [phase, setPhase] = useState<'loading' | 'approved' | 'blocked'>('loading')
  const [store, setStore] = useState<any>(null)

  const check = useCallback(async () => {
    try {
      const { data } = await api.get('/stores/my')
      setStore(data)
      setPhase(data?.status === 'APPROVED' ? 'approved' : 'blocked')
    } catch (e: any) {
      if (e?.response?.status === 404) { setStore(null); setPhase('blocked') }
      else setPhase((p) => (p === 'loading' ? 'blocked' : p))
    }
  }, [])

  useEffect(() => { check() }, [check])
  useEffect(() => {
    if (phase !== 'blocked') return
    const id = setInterval(check, 20_000)
    return () => clearInterval(id)
  }, [phase, check])

  if (phase === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    )
  }
  if (phase === 'blocked') {
    return <PendingReview store={store} onRefresh={check} />
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#AAAAAA',
        tabBarStyle: {
          borderTopColor: '#F0F0F0',
          borderTopWidth: 1,
          // Soma a área segura inferior (barra de gestos) pra não cortar os rótulos.
          height: 62 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 6,
          backgroundColor: '#fff',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 12,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 1 },
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '800', fontSize: 17 },
        headerShadowVisible: false,
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4 }}>
            <NotificationBell />
            <HeaderAvatar />
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'grid' : 'grid-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Pedidos',
          headerTitle: 'Pedidos',
          tabBarIcon: ({ focused }) => <PendingTabIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Produtos',
          headerTitle: 'Meus Produtos',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'cube' : 'cube-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="coupons"
        options={{
          title: 'Cupons',
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'ticket' : 'ticket-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Carteira',
          headerTitle: 'Minha Carteira',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'wallet' : 'wallet-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="reviews"
        options={{
          title: 'Avaliações',
          headerTitle: 'Avaliações',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'star' : 'star-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="store"
        options={{
          title: 'Loja',
          headerTitle: 'Minha Loja',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'storefront' : 'storefront-outline'} focused={focused} />
          ),
        }}
      />
    </Tabs>
  )
}
