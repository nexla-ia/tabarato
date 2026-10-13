import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, TextInput, Linking,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../src/api/client'
import { useToast } from '../../src/components/Toast'

const PRIMARY = '#FF5500'
const PRIMARY_LIGHT = '#FFF3EB'
const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const BG = '#FFFBF7'
const CARD = '#FFFFFF'
const BORDER = '#F0E8E0'
const GREEN = '#22C55E'
const RED = '#EF4444'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

interface Transaction {
  id: string
  amount: number
  type: 'CREDIT' | 'DEBIT'
  description: string
  createdAt: string
}

function fmtBRL(v: number | string) { return `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}` }

// Tipos de chave PIX aceitos pelo repasse (o Asaas exige o tipo — não dá pra
// inferir CPF vs telefone só pelos dígitos).
const PIX_TYPES: { v: string; label: string }[] = [
  { v: 'CPF', label: 'CPF' },
  { v: 'CNPJ', label: 'CNPJ' },
  { v: 'EMAIL', label: 'E-mail' },
  { v: 'PHONE', label: 'Telefone' },
  { v: 'EVP', label: 'Aleatória' },
]

/**
 * Converte o texto do campo de saque em número, tolerando vírgula OU ponto decimal
 * e separador de milhar. O último separador é o decimal ("1.234,56" e "1,234.56"
 * viram 1234.56; "50,50" e "50.50" viram 50.5).
 */
function parseAmount(raw: string): number {
  const s = (raw ?? '').trim()
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma === -1 && lastDot === -1) return parseFloat(s)
  const decimalSep = lastComma > lastDot ? ',' : '.'
  const thousandSep = decimalSep === ',' ? '.' : ','
  return parseFloat(s.split(thousandSep).join('').replace(decimalSep, '.'))
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function TxRow({ tx }: { tx: Transaction }) {
  const isCredit = tx.type === 'CREDIT'
  const icon: IoniconName = isCredit ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'
  return (
    <View style={styles.txRow}>
      <View style={[styles.txIcon, { backgroundColor: isCredit ? '#DCFCE7' : '#FEE2E2' }]}>
        <Ionicons name={icon} size={18} color={isCredit ? GREEN : RED} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.txDesc}>{tx.description}</Text>
        <Text style={styles.txDate}>{fmtDate(tx.createdAt)}</Text>
      </View>
      <Text style={[styles.txAmount, { color: isCredit ? GREEN : RED }]}>
        {isCredit ? '+' : '-'}{fmtBRL(tx.amount)}
      </Text>
    </View>
  )
}

export default function CourierWalletScreen() {
  const insets = useSafeAreaInsets()
  const { show: toast } = useToast()
  const queryClient = useQueryClient()
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [showWithdraw, setShowWithdraw] = useState(false)

  const [editingPix, setEditingPix] = useState(false)
  const [pixInput, setPixInput] = useState('')
  const [pixType, setPixType] = useState('CPF')

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['courier-wallet'],
    queryFn: async () => {
      const { data } = await api.get('/couriers/me/wallet')
      return data as { balance: number; transactions: Transaction[] }
    },
  })

  const meQ = useQuery({
    queryKey: ['courier-me'],
    queryFn: async () => (await api.get('/couriers/me')).data as { pixKey?: string | null; pixKeyType?: string | null },
  })
  const pixKey = meQ.data?.pixKey ?? ''

  // Mercado Pago (repasse automático 1:N) — só aparece quando habilitado
  const mpQ = useQuery({
    queryKey: ['courier-mp'],
    queryFn: async () => (await api.get('/couriers/mp/status')).data as { enabled: boolean; connected: boolean },
  })
  async function connectMp() {
    try {
      const { data } = await api.get('/couriers/mp/connect')
      await Linking.openURL(data.url)
      toast('Mercado Pago aberto no navegador. Após autorizar, volte e puxe pra atualizar.', 'info')
    } catch {
      toast('Não foi possível iniciar a conexão.', 'error')
    }
  }

  const { mutate: savePix, isPending: savingPix } = useMutation({
    mutationFn: async (p: { key: string; type: string }) =>
      (await api.patch('/couriers/me/pix', { pixKey: p.key, pixKeyType: p.type })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courier-me'] })
      setEditingPix(false)
      toast('Chave PIX salva!', 'success')
    },
    onError: (err: any) => toast(err.response?.data?.message ?? 'Não foi possível salvar.', 'error'),
  })

  const { mutate: requestWithdraw, isPending: withdrawing } = useMutation({
    mutationFn: async (amount: number) => {
      await api.post('/couriers/me/wallet/withdraw', { amount })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courier-wallet'] })
      setWithdrawAmount('')
      setShowWithdraw(false)
      toast('Saque solicitado! O valor será enviado via PIX.', 'success')
    },
    onError: (err: any) => {
      toast(err.response?.data?.message ?? 'Não foi possível solicitar o saque.', 'error')
    },
  })

  function handleWithdraw() {
    if (withdrawing) return // evita abrir dois alerts de confirmação em toque duplo
    const amount = parseAmount(withdrawAmount)
    if (!amount || amount <= 0) {
      toast('Digite um valor válido para o saque.', 'error')
      return
    }
    if (data && amount > data.balance) {
      toast(`Saldo insuficiente. Disponível: ${fmtBRL(data.balance)}.`, 'error')
      return
    }
    Alert.alert(
      'Confirmar saque',
      `Solicitar saque de ${fmtBRL(amount)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: () => requestWithdraw(amount) },
      ],
    )
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Minha Carteira</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={PRIMARY} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={PRIMARY} />}
        >
          {/* Balance card */}
          <View style={styles.balanceCard}>
            <View style={styles.balanceDecor} />
            <Text style={styles.balanceLabel}>Saldo disponível</Text>
            <Text style={styles.balanceValue}>{fmtBRL(data?.balance ?? 0)}</Text>
            <Text style={styles.balanceSub}>Ganhos de entregas realizadas</Text>

            <TouchableOpacity
              style={styles.withdrawBtn}
              onPress={() => setShowWithdraw(!showWithdraw)}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-up-circle-outline" size={16} color={PRIMARY} />
              <Text style={styles.withdrawBtnText}>Solicitar saque via PIX</Text>
            </TouchableOpacity>
          </View>

          {/* Chave PIX */}
          <View style={styles.pixCard}>
            <View style={styles.pixHead}>
              <Ionicons name="key-outline" size={16} color={PRIMARY} />
              <Text style={styles.pixTitle}>Chave PIX para recebimento</Text>
            </View>
            {editingPix ? (
              <>
                {/* Tipo da chave — o Asaas precisa dele pra transferir. */}
                <Text style={styles.pixTypeLabel}>Tipo da chave</Text>
                <View style={styles.pixTypeRow}>
                  {PIX_TYPES.map(t => (
                    <TouchableOpacity
                      key={t.v}
                      onPress={() => setPixType(t.v)}
                      style={[styles.pixTypeChip, pixType === t.v && styles.pixTypeChipOn]}
                    >
                      <Text style={[styles.pixTypeChipText, pixType === t.v && styles.pixTypeChipTextOn]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.pixInput}
                  value={pixInput}
                  onChangeText={setPixInput}
                  placeholder="CPF, e-mail, telefone ou aleatória"
                  placeholderTextColor={MUTED}
                  autoCapitalize="none"
                  keyboardType={pixType === 'EMAIL' ? 'email-address' : pixType === 'EVP' ? 'default' : 'numbers-and-punctuation'}
                />
                <View style={styles.pixActions}>
                  <TouchableOpacity onPress={() => setEditingPix(false)} style={styles.pixCancel}>
                    <Text style={styles.pixCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.pixSave}
                    onPress={() => { const k = pixInput.trim(); if (k) savePix({ key: k, type: pixType }) }}
                    disabled={savingPix}
                  >
                    {savingPix ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.pixSaveText}>Salvar</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : pixKey ? (
              <View style={styles.pixRow}>
                <Text style={styles.pixValue} numberOfLines={1}>{pixKey}</Text>
                <TouchableOpacity onPress={() => { setPixInput(pixKey); setPixType(meQ.data?.pixKeyType ?? 'CPF'); setEditingPix(true) }}>
                  <Text style={styles.pixEdit}>Alterar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.pixAddBtn} onPress={() => { setPixInput(''); setEditingPix(true) }}>
                <Ionicons name="add-circle-outline" size={16} color={PRIMARY} />
                <Text style={styles.pixAddText}>Cadastrar chave PIX</Text>
              </TouchableOpacity>
            )}
            {!pixKey && !editingPix && (
              <Text style={styles.pixWarn}>Você precisa de uma chave PIX cadastrada para sacar.</Text>
            )}
          </View>

          {/* Mercado Pago — repasse automático (só quando o 1:N está ativo) */}
          {mpQ.data?.enabled && (
            <View style={styles.pixCard}>
              <View style={styles.pixHead}>
                <Ionicons name="card-outline" size={16} color="#009EE3" />
                <Text style={styles.pixTitle}>Recebimento automático (Mercado Pago)</Text>
              </View>
              {mpQ.data.connected ? (
                <View style={styles.pixRow}>
                  <View style={styles.mpBadge}>
                    <Ionicons name="checkmark-circle" size={15} color="#059669" />
                    <Text style={styles.mpBadgeText}>Conta conectada</Text>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={styles.mpDesc}>Conecte sua conta pra receber cada entrega na hora, direto na sua conta MP.</Text>
                  <TouchableOpacity style={styles.mpBtn} onPress={connectMp} activeOpacity={0.85}>
                    <Ionicons name="open-outline" size={16} color="#fff" />
                    <Text style={styles.mpBtnText}>Conectar Mercado Pago</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {/* Withdraw form */}
          {showWithdraw && (
            <View style={styles.withdrawForm}>
              <Text style={styles.withdrawFormTitle}>Valor do saque</Text>
              <View style={styles.withdrawInputRow}>
                <Text style={styles.withdrawCurrency}>R$</Text>
                <TextInput
                  style={styles.withdrawInput}
                  value={withdrawAmount}
                  onChangeText={setWithdrawAmount}
                  placeholder="0,00"
                  placeholderTextColor={MUTED}
                  keyboardType="decimal-pad"
                />
              </View>
              <TouchableOpacity
                style={[styles.withdrawConfirmBtn, withdrawing && { opacity: 0.7 }]}
                onPress={handleWithdraw}
                disabled={withdrawing}
                activeOpacity={0.85}
              >
                {withdrawing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.withdrawConfirmText}>Confirmar saque</Text>
                }
              </TouchableOpacity>
              <Text style={styles.withdrawNote}>
                O valor será enviado via PIX para a chave cadastrada.
              </Text>
            </View>
          )}

          {/* Transactions */}
          <Text style={styles.sectionTitle}>Histórico de movimentações</Text>

          {!data?.transactions?.length ? (
            <View style={styles.emptyCard}>
              <Ionicons name="wallet-outline" size={36} color={MUTED} />
              <Text style={styles.emptyTitle}>Nenhuma movimentação</Text>
              <Text style={styles.emptySub}>Complete entregas para acumular saldo aqui</Text>
            </View>
          ) : (
            <View style={styles.txCard}>
              {data.transactions.map((tx, i) => (
                <View key={tx.id}>
                  <TxRow tx={tx} />
                  {i < data.transactions.length - 1 && <View style={styles.txDivider} />}
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
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: CARD,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: TEXT, letterSpacing: -0.4 },

  content: { padding: 16, gap: 16 },

  balanceCard: {
    backgroundColor: TEXT, borderRadius: 20, padding: 24,
    overflow: 'hidden', position: 'relative',
  },
  balanceDecor: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,102,0,0.15)',
    top: -60, right: -60,
  },
  balanceLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  balanceValue: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: -1, marginBottom: 4 },
  balanceSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 20 },

  withdrawBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 11, alignSelf: 'flex-start',
  },
  withdrawBtnText: { fontSize: 13, fontWeight: '800', color: PRIMARY },

  withdrawForm: {
    backgroundColor: CARD, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: BORDER,
  },
  withdrawFormTitle: { fontSize: 14, fontWeight: '800', color: TEXT, marginBottom: 12 },
  withdrawInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 12,
    paddingHorizontal: 14, marginBottom: 14,
  },
  withdrawCurrency: { fontSize: 16, fontWeight: '700', color: MUTED },
  withdrawInput: { flex: 1, fontSize: 22, fontWeight: '900', color: TEXT, paddingVertical: 12 },
  withdrawConfirmBtn: {
    backgroundColor: PRIMARY, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  withdrawConfirmText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  withdrawNote: { fontSize: 11, color: MUTED, textAlign: 'center', lineHeight: 16 },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: MUTED,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  pixCard: { backgroundColor: CARD, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER },
  pixHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  pixTitle: { fontSize: 13.5, fontWeight: '800', color: TEXT },
  pixRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pixValue: { flex: 1, fontSize: 15, fontWeight: '700', color: TEXT },
  pixEdit: { fontSize: 13, fontWeight: '700', color: PRIMARY },
  pixAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start' },
  pixAddText: { fontSize: 14, fontWeight: '700', color: PRIMARY },
  pixWarn: { fontSize: 11.5, color: '#B45309', marginTop: 8 },
  pixInput: {
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: TEXT, marginBottom: 10,
  },
  pixTypeLabel: { fontSize: 12, fontWeight: '700', color: MUTED, marginBottom: 6 },
  pixTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  pixTypeChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, borderColor: BORDER, backgroundColor: CARD,
  },
  pixTypeChipOn: { borderColor: PRIMARY, backgroundColor: '#FFF3EB' },
  pixTypeChipText: { fontSize: 12.5, fontWeight: '700', color: MUTED },
  pixTypeChipTextOn: { color: PRIMARY },
  pixActions: { flexDirection: 'row', gap: 10 },
  pixCancel: { flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: BG, borderWidth: 1, borderColor: BORDER, alignItems: 'center' },
  pixCancelText: { fontSize: 13.5, fontWeight: '700', color: MUTED },
  pixSave: { flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: PRIMARY, alignItems: 'center' },
  pixSaveText: { fontSize: 13.5, fontWeight: '800', color: '#fff' },
  mpDesc: { fontSize: 12.5, color: MUTED, lineHeight: 18, marginBottom: 12 },
  mpBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#009EE3', borderRadius: 12, paddingVertical: 13 },
  mpBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  mpBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  mpBadgeText: { color: '#059669', fontWeight: '700', fontSize: 13.5 },

  emptyCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 32,
    alignItems: 'center', gap: 8, borderWidth: 1, borderColor: BORDER,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: TEXT },
  emptySub: { fontSize: 12, color: MUTED, textAlign: 'center', lineHeight: 18 },

  txCard: {
    backgroundColor: CARD, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER, overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
  },
  txIcon: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  txDesc: { fontSize: 13, fontWeight: '600', color: TEXT, marginBottom: 2 },
  txDate: { fontSize: 11, color: MUTED },
  txAmount: { fontSize: 14, fontWeight: '800' },
  txDivider: { height: 1, backgroundColor: BORDER, marginLeft: 64 },
})
