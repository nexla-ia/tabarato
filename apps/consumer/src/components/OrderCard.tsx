import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Order } from '../types'
import { colors } from '../theme/colors'

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando confirmação',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Preparando',
  READY: 'Pronto para retirada',
  PICKED_UP: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: colors.warning,
  CONFIRMED: colors.primary,
  PREPARING: colors.primary,
  READY: colors.primaryMid,
  PICKED_UP: colors.primaryMid,
  DELIVERED: colors.success,
  CANCELLED: colors.danger,
}

const STATUS_ICON: Record<string, string> = {
  PENDING: '⏳',
  CONFIRMED: '✅',
  PREPARING: '👨‍🍳',
  READY: '📦',
  PICKED_UP: '🛵',
  DELIVERED: '🎉',
  CANCELLED: '❌',
}

interface Props {
  order: Order
  onPress: () => void
}

export function OrderCard({ order, onPress }: Props) {
  const statusColor = STATUS_COLOR[order.status] ?? colors.textMuted
  const statusLabel = STATUS_LABEL[order.status] ?? order.status
  const statusIcon = STATUS_ICON[order.status] ?? '📋'

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88}>
      {/* Status stripe */}
      <View style={[styles.stripe, { backgroundColor: statusColor }]} />

      <View style={styles.content}>
        {/* Header row */}
        <View style={styles.header}>
          <View style={styles.storeInfo}>
            <View style={styles.storeLogo}>
              <Text style={styles.storeLogoText}>{order.store?.name?.[0] ?? '?'}</Text>
            </View>
            <View>
              <Text style={styles.storeName} numberOfLines={1}>{order.store.name}</Text>
              <Text style={styles.date}>
                {new Date(order.createdAt).toLocaleDateString('pt-BR', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
            <Text style={styles.statusIcon}>{statusIcon}</Text>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Items */}
        <Text style={styles.items} numberOfLines={2}>
          {order.items.map((i) => `${i.quantity}× ${i.product.name}`).join('  ·  ')}
        </Text>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.itemCount}>{order.items.length} {order.items.length === 1 ? 'item' : 'itens'}</Text>
          <Text style={styles.total}>R$ {Number(order.total).toFixed(2)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 12,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
    overflow: 'hidden',
  },
  stripe: { width: 5, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
  content: { flex: 1, padding: 14 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  storeInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 },
  storeLogo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeLogoText: { fontSize: 18, fontWeight: '800', color: colors.primary },
  storeName: { fontSize: 14, fontWeight: '700', color: colors.text },
  date: { fontSize: 11, color: colors.textLight, marginTop: 2 },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusIcon: { fontSize: 11 },
  statusText: { fontSize: 10, fontWeight: '700' },

  divider: { height: 1, backgroundColor: colors.border, marginBottom: 10 },

  items: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: 10 },

  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemCount: { fontSize: 12, color: colors.textLight },
  total: { fontSize: 16, fontWeight: '800', color: colors.text },
})
