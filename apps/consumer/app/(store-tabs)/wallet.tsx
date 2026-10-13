import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, TextInput, Share,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../src/api/client'
import { useToast } from '../../src/components/Toast'

const PRIMARY = '#FF5500'
const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const BG = '#FFFBF7'
const CARD = '#FFFFFF'
const BORDER = '#F0E8E0'
const GREEN = '#22C55E'
const RED = '#EF4444'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

// Tipos de chave PIX aceitos pelo Asaas. O tipo é obrigatório porque o Asaas NÃO
// infere chave aleatória (EVP) — sem ele, o saque com EVP falha.
type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP'
const PIX_TYPES: { value: PixKeyType; label: string }[] = [
  { value: 'CPF', label: 'CPF' },
  { value: 'CNPJ', label: 'CNPJ' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'PHONE', label: 'Telefone' },
  { value: 'EVP', label: 'Aleatória' },
]
const PIX_PLACEHOLDER: Record<PixKeyType, string> = {
  CPF: '000.000.000-00',
  CNPJ: '00.000.000/0000-00',
  EMAIL: 'voce@email.com',
  PHONE: '+55 69 90000-0000',
  EVP: 'chave aleatória (32 caracteres)',
}

interface Transaction {
  id: string
  amount: number
  type: 'CREDIT' | 'DEBIT'
  description: string
  createdAt: string
}

function fmtBRL(v: number | string) { return `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}` }
function fmtDate(d: string) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function TxRow({ tx }: { tx: Transaction }) {
  const { show: toast } = useToast()
  const isCredit = tx.type === 'CREDIT'
  const icon: IoniconName = isCredit ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'
  const [downloadingReceipt, setDownloadingReceipt] = useState(false)

  async function handleReceipt() {
    setDownloadingReceipt(true)
    try {
      const { data } = await api.get(`/stores/my/transactions/${tx.id}/receipt`)
      await Share.share({ message: data, title: `Recibo ${tx.id.slice(-8).toUpperCase()}` })
    } catch {
      toast('Não foi possível gerar o recibo.', 'error')
    } finally {
      setDownloadingReceipt(false)
    }
  }

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
      <TouchableOpacity onPress={handleReceipt} disabled={downloadingReceipt} style={{ marginLeft: 8, padding: 4 }}>
        {downloadingReceipt
          ? <ActivityIndicator size="small" color={PRIMARY} />
          : <Ionicons name="receipt-outline" size={18} color={PRIMARY} />
        }
      </TouchableOpacity>
    </View>
  )
}

export default function StoreWalletScreen() {
  const insets = useSafeAreaInsets()
  const { show: toast } = useToast()
  const queryClient = useQueryClient()
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [pixInput, setPixInput] = useState('')
  const [pixType, setPixType] = useState<PixKeyType>('CPF')
  const [editingPix, setEditingPix] = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      const { data } = await api.get('/stores/my/orders/export')
      await Share.share({ message: data, title: 'pedidos.csv' })
    } catch {
      toast('Não foi possível exportar os pedidos.', 'error')
    } finally {
      setExporting(false)
    }
  }

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['store-wallet'],
    queryFn: async () => {
      const { data } = await api.get('/stores/my/wallet')
      return data as { balance: number; transactions: Transaction[]; pixKey: string | null; pixKeyType: PixKeyType | null }
    },
  })

  const { mutate: savePix, isPending: savingPix } = useMutation({
    mutationFn: async ({ key, type }: { key: string; type: PixKeyType }) => {
      await api.patch('/stores/my/pix', { pixKey: key.trim(), pixKeyType: type })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-wallet'] })
      setEditingPix(false)
      toast('Chave PIX de recebimento salva.', 'success')
    },
    onError: (err: any) => toast(err.response?.data?.message ?? 'Não foi possível salvar a chave PIX.', 'error'),
  })

  const { mutate: requestWithdraw, isPending: withdrawing } = useMutation({
    mutationFn: async (amount: number) => {
      await api.post('/stores/my/wallet/withdraw', { amount })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-wallet'] })
      setWithdrawAmount('')
      setShowWithdraw(false)
      toast('Seu saque será processado em até 24h via PIX para a chave cadastrada.', 'success')
    },
    onError: (err: any) => {
      toast(err.response?.data?.message ?? 'Não foi possível solicitar o saque.', 'error')
    },
  })

  function handleWithdraw() {
    if (!data?.pixKey) {
      Alert.alert(
        'Cadastre sua chave PIX',
        'Antes de sacar, cadastre a chave PIX onde você quer receber o repasse.',
        [{ text: 'Ok', onPress: () => { setPixInput(''); setEditingPix(true); setShowWithdraw(false) } }],
      )
      return
    }
    const cleaned = withdrawAmount.replace(',', '.').trim()
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
      toast('Digite apenas números. Ex: 50,00', 'error')
      return
    }
    const amount = parseFloat(cleaned)
    if (!amount || amount <= 0) {
      toast('O valor deve ser maior que zero.', 'error')
      return
    }
    if (data && amount > data.balance) {
      toast(`Seu saldo disponível é ${fmtBRL(data.balance)}.`, 'error')
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
            <Text style={styles.balanceLabel}>Saldo a receber</Text>
            <Text style={styles.balanceValue}>{fmtBRL(data?.balance ?? 0)}</Text>
            <Text style={styles.balanceSub}>90% do subtotal dos pedidos entregues</Text>

            <TouchableOpacity
              style={styles.withdrawBtn}
              onPress={() => setShowWithdraw(!showWithdraw)}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-up-circle-outline" size={16} color={PRIMARY} />
              <Text style={styles.withdrawBtnText}>Solicitar saque via PIX</Text>
            </TouchableOpacity>
          </View>

          {/* Chave PIX de recebimento (pra onde vai o saque) */}
          <View style={styles.pixCard}>
            <View style={styles.pixHeader}>
              <Ionicons name="key-outline" size={16} color={PRIMARY} />
              <Text style={styles.pixTitle}>Chave PIX para receber</Text>
            </View>
            {editingPix ? (
              <>
                {/* Tipo da chave — obrigatório (o Asaas não adivinha chave aleatória) */}
                <Text style={styles.pixTypeLabel}>Tipo da chave</Text>
                <View style={styles.pixTypeRow}>
                  {PIX_TYPES.map((t) => {
                    const active = pixType === t.value
                    return (
                      <TouchableOpacity
                        key={t.value}
                        style={[styles.pixTypeChip, active && styles.pixTypeChipActive]}
                        onPress={() => setPixType(t.value)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.pixTypeChipText, active && styles.pixTypeChipTextActive]}>{t.label}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                <TextInput
                  style={styles.pixInput}
                  value={pixInput}
                  onChangeText={setPixInput}
                  placeholder={PIX_PLACEHOLDER[pixType]}
                  placeholderTextColor={MUTED}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={pixType === 'CPF' || pixType === 'CNPJ' || pixType === 'PHONE' ? 'default' : (pixType === 'EMAIL' ? 'email-address' : 'default')}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.pixSaveBtn, savingPix && { opacity: 0.7 }]}
                    onPress={() => { if (pixInput.trim()) savePix({ key: pixInput, type: pixType }) }}
                    disabled={savingPix}
                    activeOpacity={0.85}
                  >
                    {savingPix ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.pixSaveText}>Salvar</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.pixCancelBtn} onPress={() => setEditingPix(false)} activeOpacity={0.8}>
                    <Text style={styles.pixCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : data?.pixKey ? (
              <View style={styles.pixRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pixValue} numberOfLines={1}>{data.pixKey}</Text>
                  {data.pixKeyType ? (
                    <Text style={styles.pixTypeTag}>{PIX_TYPES.find(t => t.value === data.pixKeyType)?.label ?? data.pixKeyType}</Text>
                  ) : null}
                </View>
                <TouchableOpacity onPress={() => { setPixInput(data.pixKey ?? ''); setPixType(data.pixKeyType ?? 'CPF'); setEditingPix(true) }}>
                  <Text style={styles.pixEdit}>Editar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.pixSetBtn} onPress={() => { setPixInput(''); setPixType('CPF'); setEditingPix(true) }} activeOpacity={0.85}>
                <Ionicons name="add-circle-outline" size={16} color={PRIMARY} />
                <Text style={styles.pixSetText}>Cadastrar chave PIX</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.pixNote}>É para esta chave que enviamos seus saques. Não é a chave que o cliente usa pra pagar.</Text>
          </View>

          {/* Info box */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color={MUTED} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoText, { fontWeight: '700', marginBottom: 4 }]}>
                Como funciona o repasse
              </Text>
              <Text style={styles.infoText}>
                • Pedido entregue: <Text style={{ fontWeight: '700', color: GREEN }}>90% do subtotal</Text> creditado aqui
              </Text>
              <Text style={styles.infoText}>
                • Saques processados em <Text style={{ fontWeight: '700' }}>até 24h</Text> via PIX para a chave cadastrada
              </Text>
              <Text style={styles.infoText}>
                • A taxa de 10% é da plataforma Tá Barato
              </Text>
            </View>
          </View>

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
                O valor será enviado para a chave PIX cadastrada na sua loja em até 24h.
              </Text>
            </View>
          )}

          {/* Export */}
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={handleExport}
            disabled={exporting}
            activeOpacity={0.8}
          >
            {exporting
              ? <ActivityIndicator size="small" color={PRIMARY} />
              : <Ionicons name="download-outline" size={16} color={PRIMARY} />
            }
            <Text style={styles.exportBtnText}>
              {exporting ? 'Exportando...' : 'Exportar pedidos (CSV)'}
            </Text>
          </TouchableOpacity>

          {/* Transactions */}
          <Text style={styles.sectionTitle}>Histórico de movimentações</Text>

          {!data?.transactions?.length ? (
            <View style={styles.emptyCard}>
              <Ionicons name="wallet-outline" size={36} color={MUTED} />
              <Text style={styles.emptyTitle}>Nenhuma movimentação</Text>
              <Text style={styles.emptySub}>Os repasses aparecerão aqui após a confirmação de cada entrega</Text>
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
  content: { padding: 16, gap: 16 },

  balanceCard: {
    backgroundColor: '#0D3B2E', borderRadius: 20, padding: 24,
    overflow: 'hidden', position: 'relative',
  },
  balanceDecor: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(34,197,94,0.12)',
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

  pixCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: BORDER, gap: 10,
  },
  pixHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pixTitle: { fontSize: 14, fontWeight: '800', color: TEXT },
  pixRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pixValue: { flex: 1, fontSize: 15, fontWeight: '700', color: TEXT },
  pixEdit: { fontSize: 13, fontWeight: '800', color: PRIMARY },
  pixInput: {
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: TEXT,
  },
  pixTypeLabel: { fontSize: 12, fontWeight: '700', color: MUTED, marginBottom: 6 },
  pixTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  pixTypeChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, borderColor: BORDER, backgroundColor: CARD,
  },
  pixTypeChipActive: { borderColor: PRIMARY, backgroundColor: '#FFF0EB' },
  pixTypeChipText: { fontSize: 12.5, fontWeight: '700', color: MUTED },
  pixTypeChipTextActive: { color: PRIMARY },
  pixTypeTag: { fontSize: 11, fontWeight: '700', color: MUTED, marginTop: 2 },
  pixSaveBtn: {
    flex: 1, backgroundColor: PRIMARY, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
  },
  pixSaveText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  pixCancelBtn: {
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12,
    backgroundColor: '#F5EEE9', alignItems: 'center', justifyContent: 'center',
  },
  pixCancelText: { fontSize: 14, fontWeight: '700', color: MUTED },
  pixSetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: PRIMARY, borderRadius: 12, paddingVertical: 11,
  },
  pixSetText: { fontSize: 14, fontWeight: '800', color: PRIMARY },
  pixNote: { fontSize: 11, color: MUTED, lineHeight: 15 },

  infoBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#FFF8F0', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#FFE0C2',
  },
  infoText: { flex: 1, fontSize: 12, color: MUTED, lineHeight: 17 },

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

  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: CARD, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1.5, borderColor: PRIMARY,
    marginBottom: 20,
  },
  exportBtnText: { fontSize: 14, fontWeight: '700', color: PRIMARY },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: MUTED,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

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
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  txIcon: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  txDesc: { fontSize: 13, fontWeight: '600', color: TEXT, marginBottom: 2 },
  txDate: { fontSize: 11, color: MUTED },
  txAmount: { fontSize: 14, fontWeight: '800' },
  txDivider: { height: 1, backgroundColor: BORDER, marginLeft: 64 },
})
