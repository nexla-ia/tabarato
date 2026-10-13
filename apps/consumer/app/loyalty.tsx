import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../src/api/client'
import { colors } from '../src/theme/colors'
import { LoadError } from '../src/components/LoadError'

const PRIMARY = colors.primary
const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const BG = '#FFF8F3'
const CARD = '#FFFFFF'
const BORDER = '#F0E8E0'
const GOLD = '#F59E0B'

interface Transaction {
  id: string; points: number; type: string; description: string; createdAt: string
}

interface Account {
  points: number; lifetimePoints: number; transactions: Transaction[]
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export default function LoyaltyScreen() {
  const insets = useSafeAreaInsets()
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // Sem isto, rede caindo mostrava "0 pontos" — o cliente achava que perdeu o saldo.
  function load() {
    setLoading(true); setLoadError(false)
    api.get('/users/me/loyalty')
      .then(r => setAccount(r.data))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const discount = account ? Math.floor(account.points / 100) * 10 : 0

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <Text style={styles.title}>Meus Pontos</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={PRIMARY} style={{ marginTop: 60 }} size="large" />
      ) : loadError ? (
        <LoadError onRetry={load} sub="Não conseguimos buscar seus pontos. Verifique a conexão." />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Balance card */}
          <View style={styles.balanceCard}>
            <View style={styles.balanceDecor} />
            <Ionicons name="star" size={28} color={GOLD} style={{ marginBottom: 8 }} />
            <Text style={styles.balancePoints}>{account?.points ?? 0}</Text>
            <Text style={styles.balanceLabel}>pontos disponíveis</Text>
            {discount > 0 && (
              <View style={styles.discountChip}>
                <Text style={styles.discountText}>= R$ {discount.toFixed(0)} de desconto</Text>
              </View>
            )}
            <Text style={styles.lifetimeText}>
              Total acumulado: {account?.lifetimePoints ?? 0} pontos
            </Text>
          </View>

          {/* Rules */}
          <View style={styles.rulesCard}>
            <Text style={styles.rulesTitle}>Como funciona</Text>
            {[
              { icon: 'cart-outline', text: '1 ponto a cada R$1 gasto em pedidos entregues' },
              { icon: 'gift-outline', text: '100 pontos = R$10 de desconto no próximo pedido' },
              { icon: 'people-outline', text: 'Indique amigos e ganhe 50 pontos cada' },
            ].map((r, i) => (
              <View key={i} style={styles.ruleRow}>
                <View style={styles.ruleIcon}>
                  <Ionicons name={r.icon as any} size={16} color={PRIMARY} />
                </View>
                <Text style={styles.ruleText}>{r.text}</Text>
              </View>
            ))}
          </View>

          {/* Transactions */}
          <Text style={styles.sectionTitle}>Histórico</Text>
          {!account?.transactions?.length ? (
            <View style={styles.emptyTx}>
              <Text style={styles.emptyTxText}>Nenhuma movimentação ainda. Faça seu primeiro pedido!</Text>
            </View>
          ) : (
            <View style={styles.txCard}>
              {account.transactions.map((tx, i) => (
                <View key={tx.id} style={[styles.txRow, i > 0 && styles.txRowBorder]}>
                  <View style={[styles.txIcon, { backgroundColor: tx.points > 0 ? '#D1FAE5' : '#FEE2E2' }]}>
                    <Ionicons
                      name={tx.points > 0 ? 'add-circle-outline' : 'remove-circle-outline'}
                      size={18}
                      color={tx.points > 0 ? '#059669' : '#DC2626'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txDesc}>{tx.description}</Text>
                    <Text style={styles.txDate}>{fmtDate(tx.createdAt)}</Text>
                  </View>
                  <Text style={[styles.txPoints, { color: tx.points > 0 ? '#059669' : '#DC2626' }]}>
                    {tx.points > 0 ? '+' : ''}{tx.points} pts
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#F5F0EC', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '900', color: TEXT },
  content: { padding: 16, gap: 14, paddingBottom: 40 },

  balanceCard: {
    backgroundColor: PRIMARY, borderRadius: 20, padding: 24,
    alignItems: 'center', overflow: 'hidden', position: 'relative',
  },
  balanceDecor: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.08)', top: -60, right: -40,
  },
  balancePoints: { fontSize: 56, fontWeight: '900', color: '#fff', letterSpacing: -2 },
  balanceLabel: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 10 },
  discountChip: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 6, marginBottom: 8,
  },
  discountText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  lifetimeText: { fontSize: 11, color: 'rgba(255,255,255,0.6)' },

  rulesCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: BORDER, gap: 12,
  },
  rulesTitle: { fontSize: 14, fontWeight: '800', color: TEXT, marginBottom: 4 },
  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  ruleIcon: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: '#FFF0EB',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  ruleText: { flex: 1, fontSize: 13, color: MUTED, lineHeight: 18, paddingTop: 6 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8 },

  emptyTx: {
    backgroundColor: CARD, borderRadius: 12, padding: 20,
    borderWidth: 1, borderColor: BORDER, alignItems: 'center',
  },
  emptyTxText: { fontSize: 13, color: MUTED, textAlign: 'center' },

  txCard: { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  txRowBorder: { borderTopWidth: 1, borderTopColor: BORDER },
  txIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txDesc: { fontSize: 13, fontWeight: '600', color: TEXT },
  txDate: { fontSize: 11, color: MUTED, marginTop: 1 },
  txPoints: { fontSize: 14, fontWeight: '800' },
})
