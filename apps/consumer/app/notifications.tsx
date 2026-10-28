import { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../src/api/client'
import { useAuthStore } from '../src/stores/auth.store'

const PRIMARY       = '#FF5500'
const PRIMARY_LIGHT = '#FFF0EB'
const TEXT          = '#1A0A00'
const MUTED         = '#9A8880'
const CARD          = '#FFFFFF'
const BORDER        = '#F0E8E2'
const BG            = '#FFF8F3'

type NotificationType = 'ORDER_UPDATE' | 'DELIVERY_UPDATE' | 'PAYMENT' | 'PROMOTION' | 'SYSTEM'

interface Notification {
  id: string
  type: NotificationType
  title: string
  body?: string
  isRead: boolean
  createdAt: string
  data?: Record<string, any>
}

const TYPE_META: Record<NotificationType, { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; bg: string }> = {
  ORDER_UPDATE:    { icon: 'receipt-outline',  color: PRIMARY,    bg: PRIMARY_LIGHT },
  DELIVERY_UPDATE: { icon: 'bicycle-outline',  color: '#7C3AED',  bg: '#EDE9FE' },
  PAYMENT:         { icon: 'card-outline',     color: '#059669',  bg: '#D1FAE5' },
  PROMOTION:       { icon: 'ticket-outline',   color: '#D97706',  bg: '#FEF3C7' },
  SYSTEM:          { icon: 'information-circle-outline', color: '#2563EB', bg: '#DBEAFE' },
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  if (mins < 1)  return 'agora'
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

function NotificationItem({ item, onPress }: { item: Notification; onPress: () => void }) {
  const meta = TYPE_META[item.type] ?? TYPE_META.SYSTEM
  return (
    <TouchableOpacity
      style={[styles.item, !item.isRead && styles.itemUnread]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {!item.isRead && <View style={styles.unreadDot} />}
      <View style={[styles.itemIcon, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={20} color={meta.color} />
      </View>
      <View style={styles.itemBody}>
        <Text style={[styles.itemTitle, !item.isRead && styles.itemTitleUnread]} numberOfLines={1}>
          {item.title}
        </Text>
        {item.body ? <Text style={styles.itemText} numberOfLines={2}>{item.body}</Text> : null}
        <Text style={styles.itemTime}>{timeAgo(item.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  )
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets()
  const user = useAuthStore((s) => s.user)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)

  async function load() {
    setLoadError(false)
    try {
      const { data } = await api.get<Notification[]>('/notifications')
      setNotifications(data)
    } catch {
      setLoadError(true)
    }
  }

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false))
    }, []),
  )

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function handleMarkAllRead() {
    setMarkingAll(true)
    try {
      await api.patch('/notifications/read-all')
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    } catch {} finally {
      setMarkingAll(false)
    }
  }

  async function handlePressItem(n: Notification) {
    if (!n.isRead) {
      await api.patch(`/notifications/${n.id}/read`).catch(() => {})
      setNotifications((prev) => prev.map((item) => item.id === n.id ? { ...item, isRead: true } : item))
    }
    if (n.data?.screen === 'meus-anuncios') {
      router.push('/meus-anuncios' as any)
    } else if (n.data?.orderId) {
      router.push(`/order/${n.data.orderId}`)
    }
  }

  const unread = notifications.filter((n) => !n.isRead).length

  if (!user) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={20} color={TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notificações</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={40} color={MUTED} />
          <Text style={styles.emptyTitle}>Faça login para ver notificações</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notificações</Text>
        {unread > 0 ? (
          <TouchableOpacity
            style={styles.markAllBtn}
            onPress={handleMarkAllRead}
            disabled={markingAll}
            activeOpacity={0.8}
          >
            {markingAll
              ? <ActivityIndicator size="small" color={PRIMARY} />
              : <Text style={styles.markAllText}>Marcar tudo</Text>
            }
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={PRIMARY} size="large" />
      ) : loadError ? (
        <View style={[styles.center, { marginTop: 60, gap: 12 }]}>
          <Ionicons name="cloud-offline-outline" size={48} color={MUTED} />
          <Text style={styles.emptyTitle}>Não foi possível carregar</Text>
          <Text style={styles.emptySub}>Verifique sua conexão e tente novamente.</Text>
          <TouchableOpacity
            onPress={() => { setLoading(true); load().finally(() => setLoading(false)) }}
            style={{ backgroundColor: PRIMARY, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}
          >
            <Text style={{ color: '#fff', fontWeight: '800' }}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={PRIMARY} />
          }
          ListHeaderComponent={
            unread > 0 ? (
              <View style={styles.unreadBanner}>
                <View style={styles.unreadBannerDot} />
                <Text style={styles.unreadBannerText}>{unread} não lida{unread > 1 ? 's' : ''}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="notifications-outline" size={40} color={MUTED} />
              </View>
              <Text style={styles.emptyTitle}>Tudo em dia!</Text>
              <Text style={styles.emptySub}>Suas notificações aparecerão aqui.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <NotificationItem item={item} onPress={() => handlePressItem(item)} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: BG, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F0E8E2', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: TEXT, letterSpacing: -0.3 },
  markAllBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: PRIMARY_LIGHT },
  markAllText: { fontSize: 12, fontWeight: '700', color: PRIMARY },

  list: { paddingTop: 8 },

  unreadBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 8,
    backgroundColor: PRIMARY_LIGHT, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  unreadBannerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PRIMARY },
  unreadBannerText: { fontSize: 13, fontWeight: '700', color: PRIMARY },

  item: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: CARD, paddingHorizontal: 16, paddingVertical: 14,
    position: 'relative',
  },
  itemUnread: { backgroundColor: '#FFFBF7' },
  unreadDot: {
    position: 'absolute', left: 6, top: 18,
    width: 6, height: 6, borderRadius: 3, backgroundColor: PRIMARY,
  },
  itemIcon: {
    width: 42, height: 42, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  itemBody: { flex: 1 },
  itemTitle: { fontSize: 14, fontWeight: '600', color: TEXT, marginBottom: 3 },
  itemTitleUnread: { fontWeight: '800' },
  itemText: { fontSize: 13, color: MUTED, lineHeight: 18, marginBottom: 4 },
  itemTime: { fontSize: 11, color: MUTED },

  separator: { height: 1, backgroundColor: BORDER, marginLeft: 70 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#F5EDE8', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: TEXT, marginBottom: 6 },
  emptySub: { fontSize: 13, color: MUTED, textAlign: 'center' },
})
