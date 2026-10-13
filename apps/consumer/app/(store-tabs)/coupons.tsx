import { useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Switch, TextInput, ScrollView, ActivityIndicator,
  Modal, KeyboardAvoidingView, Platform, Pressable, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../src/api/client'
import { useToast } from '../../src/components/Toast'

const PRIMARY   = '#FF5500'
const BG        = '#FFF8F3'
const CARD      = '#FFFFFF'
const TEXT      = '#1A0A00'
const MUTED     = '#9A8880'
const BORDER    = '#F0E8E2'
const SUCCESS   = '#059669'
const DANGER    = '#DC2626'

interface Coupon {
  id: string
  code: string
  description?: string
  discountPercent?: number
  discountFixed?: number
  freeShipping?: boolean
  minOrderValue?: number
  maxUses?: number
  usedCount: number
  expiresAt?: string
  isActive: boolean
  createdAt: string
}

const EMPTY_FORM = {
  code: '',
  description: '',
  discountType: 'percent' as 'percent' | 'fixed',
  discountValue: '',
  freeShipping: false,
  minOrderValue: '',
  maxUses: '',
  expiresAt: '',
}

// Máscara de data BR: só dígitos → DD/MM/AAAA.
function maskDateBR(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}
// DD/MM/AAAA → ISO (fim do dia local, pra validade valer o dia inteiro). null se inválida.
function brDateToISO(v: string): string | null {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const day = +m[1], month = +m[2], year = +m[3]
  const dt = new Date(year, month - 1, day, 23, 59, 59)
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null
  return dt.toISOString()
}

// ── Ticket card ───────────────────────────────────────────────────────────────

function CouponCard({
  coupon,
  onToggle,
  onDelete,
  toggling,
}: {
  coupon: Coupon
  onToggle: () => void
  onDelete: () => void
  toggling: boolean
}) {
  const hasDiscount = coupon.discountPercent != null || coupon.discountFixed != null
  const isPercent = coupon.discountPercent != null
  const discountLabel = hasDiscount
    ? (isPercent
        ? `${coupon.discountPercent}% OFF`
        : `R$ ${Number(coupon.discountFixed ?? 0).toFixed(2)} OFF`)
    : 'FRETE GRÁTIS'

  const expired = coupon.expiresAt && new Date(coupon.expiresAt) < new Date()
  const exhausted = coupon.maxUses != null && coupon.usedCount >= coupon.maxUses

  const statusColor = !coupon.isActive ? MUTED
    : expired || exhausted ? DANGER
    : SUCCESS

  const statusLabel = !coupon.isActive ? 'Inativo'
    : expired ? 'Expirado'
    : exhausted ? 'Esgotado'
    : 'Ativo'

  function formatExpiry(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const isDimmed = !coupon.isActive || !!expired || !!exhausted

  return (
    <View style={[styles.ticket, isDimmed && styles.ticketInactive]}>
      {/* Left accent stripe */}
      <View style={[styles.ticketStripe, { backgroundColor: isDimmed ? MUTED : PRIMARY }]} />

      {/* Perforation dots */}
      <View style={styles.perfColumn}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} style={styles.perfDot} />
        ))}
      </View>

      {/* Main content */}
      <View style={styles.ticketBody}>
        {/* Top row: code + discount */}
        <View style={styles.ticketTop}>
          <View style={styles.ticketCodeWrap}>
            <Text style={styles.ticketCode}>{coupon.code}</Text>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          <View style={[styles.discountBadge, { backgroundColor: coupon.isActive ? PRIMARY : MUTED }]}>
            <Text style={styles.discountBadgeText}>{discountLabel}</Text>
          </View>
        </View>

        {/* Description */}
        {coupon.description ? (
          <Text style={styles.ticketDesc}>{coupon.description}</Text>
        ) : null}

        {/* Meta row */}
        <View style={styles.ticketMeta}>
          {coupon.freeShipping && hasDiscount ? (
            <View style={[styles.metaChip, { backgroundColor: '#FFF0E6' }]}>
              <Ionicons name="bicycle" size={11} color={PRIMARY} />
              <Text style={[styles.metaChipText, { color: PRIMARY, fontWeight: '700' }]}>Frete grátis</Text>
            </View>
          ) : null}
          {coupon.minOrderValue ? (
            <View style={styles.metaChip}>
              <Ionicons name="cart-outline" size={11} color={MUTED} />
              <Text style={styles.metaChipText}>Mín. R$ {Number(coupon.minOrderValue).toFixed(2)}</Text>
            </View>
          ) : null}
          {coupon.expiresAt ? (
            <View style={[styles.metaChip, expired && styles.metaChipDanger]}>
              <Ionicons name="calendar-outline" size={11} color={expired ? DANGER : MUTED} />
              <Text style={[styles.metaChipText, expired && { color: DANGER }]}>
                {formatExpiry(coupon.expiresAt)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Bottom row: uses + actions */}
        <View style={styles.ticketBottom}>
          <Text style={styles.usesText}>
            {coupon.usedCount}
            {coupon.maxUses != null ? `/${coupon.maxUses}` : ''} uso{coupon.usedCount !== 1 ? 's' : ''}
          </Text>
          <View style={styles.ticketActions}>
            <Switch
              value={coupon.isActive}
              onValueChange={onToggle}
              disabled={toggling}
              trackColor={{ false: '#E5DDD8', true: PRIMARY + '55' }}
              thumbColor={coupon.isActive ? PRIMARY : '#C8B8B0'}
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            />
            <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={16} color={DANGER} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyTicket}>
        <View style={styles.emptyTicketStripe} />
        <View style={styles.emptyTicketPerf}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.perfDot} />
          ))}
        </View>
        <View style={styles.emptyTicketBody}>
          <Text style={styles.emptyCode}>CUPOM00</Text>
          <Text style={styles.emptyDiscount}>— % OFF —</Text>
        </View>
      </View>
      <Text style={styles.emptyTitle}>Nenhum cupom criado</Text>
      <Text style={styles.emptySub}>Crie cupons para atrair clientes e aumentar suas vendas</Text>
      <TouchableOpacity style={styles.emptyBtn} onPress={onPress} activeOpacity={0.85}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.emptyBtnText}>Criar primeiro cupom</Text>
      </TouchableOpacity>
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'active' | 'expired'

export default function CouponsScreen() {
  const insets = useSafeAreaInsets()
  const { show: toast } = useToast()
  const queryClient = useQueryClient()
  const [showSheet, setShowSheet] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [deletingExpired, setDeletingExpired] = useState(false)

  const { data: coupons = [], isLoading } = useQuery<Coupon[]>({
    queryKey: ['coupons'],
    queryFn: async () => {
      const { data } = await api.get('/coupons')
      return data
    },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['coupons'] })

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.code.trim()) throw new Error('Informe o código do cupom')
      const hasValue = !!form.discountValue && parseFloat(form.discountValue) > 0
      // Precisa de um benefício: desconto no valor OU frete grátis.
      if (!hasValue && !form.freeShipping) throw new Error('Informe o valor do desconto ou marque frete grátis')

      const body: any = { code: form.code.trim().toUpperCase() }
      if (form.description) body.description = form.description
      if (hasValue) {
        if (form.discountType === 'percent') body.discountPercent = parseFloat(form.discountValue)
        else body.discountFixed = parseFloat(form.discountValue)
      }
      if (form.freeShipping) body.freeShipping = true
      if (form.minOrderValue) body.minOrderValue = parseFloat(form.minOrderValue)
      if (form.maxUses) body.maxUses = parseInt(form.maxUses, 10)
      if (form.expiresAt) {
        const iso = brDateToISO(form.expiresAt)
        if (!iso) throw new Error('Validade inválida. Use DD/MM/AAAA (ex: 31/12/2025).')
        body.expiresAt = iso
      }

      const { data } = await api.post('/coupons', body)
      return data
    },
    onSuccess: () => {
      invalidate()
      setShowSheet(false)
      setForm(EMPTY_FORM)
      setFormError('')
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.message ?? err.message ?? 'Erro ao criar cupom')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/coupons/${id}/toggle`),
    onMutate: (id) => setTogglingId(id),
    onSettled: () => { setTogglingId(null); invalidate() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/coupons/${id}`),
    onSuccess: invalidate,
  })

  function handleDelete(coupon: Coupon) {
    Alert.alert(
      'Excluir cupom',
      `Deseja excluir o cupom "${coupon.code}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => deleteMutation.mutate(coupon.id) },
      ]
    )
  }

  async function handleDeleteAllExpired() {
    const expired = coupons.filter(c => c.expiresAt && new Date(c.expiresAt) < new Date())
    if (expired.length === 0) { toast('Não há cupons expirados para remover.', 'info'); return }
    Alert.alert(
      'Limpar expirados',
      `Remover ${expired.length} cupom${expired.length > 1 ? 'ns' : ''} expirado${expired.length > 1 ? 's' : ''}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover todos',
          style: 'destructive',
          onPress: async () => {
            setDeletingExpired(true)
            try {
              await Promise.all(expired.map(c => api.delete(`/coupons/${c.id}`)))
              invalidate()
            } catch {
              Alert.alert('Erro', 'Alguns cupons não puderam ser removidos.')
            } finally {
              setDeletingExpired(false)
            }
          },
        },
      ]
    )
  }

  const filteredCoupons = coupons.filter(c => {
    const isExpired = !!c.expiresAt && new Date(c.expiresAt) < new Date()
    const isExhausted = c.maxUses != null && c.usedCount >= c.maxUses
    const isActive = c.isActive && !isExpired && !isExhausted
    if (filterTab === 'active') return isActive
    if (filterTab === 'expired') return isExpired || isExhausted || !c.isActive
    return true
  })
  const expiredCount = coupons.filter(c => !!c.expiresAt && new Date(c.expiresAt) < new Date()).length

  function setField(key: keyof typeof EMPTY_FORM) {
    return (val: string) => {
      setForm((prev) => ({ ...prev, [key]: val }))
      setFormError('')
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Cupons</Text>
          <Text style={styles.headerSub}>{coupons.length} total · {expiredCount} expirado{expiredCount !== 1 ? 's' : ''}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {expiredCount > 0 && (
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: '#FEE2E2', paddingHorizontal: 12 }]}
              onPress={handleDeleteAllExpired}
              disabled={deletingExpired}
              activeOpacity={0.8}
            >
              {deletingExpired
                ? <ActivityIndicator size="small" color={DANGER} />
                : <Ionicons name="trash-outline" size={18} color={DANGER} />
              }
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowSheet(true)} activeOpacity={0.85}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {(['all', 'active', 'expired'] as FilterTab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.filterTab, filterTab === tab && styles.filterTabActive]}
            onPress={() => setFilterTab(tab)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterTabText, filterTab === tab && styles.filterTabTextActive]}>
              {tab === 'all' ? 'Todos' : tab === 'active' ? 'Ativos' : 'Inativos/Expirados'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={PRIMARY} size="large" />
        </View>
      ) : (
        <FlatList
          data={filteredCoupons}
          keyExtractor={(c) => c.id}
          contentContainerStyle={coupons.length ? styles.list : styles.listEmpty}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState onPress={() => setShowSheet(true)} />}
          renderItem={({ item }) => (
            <CouponCard
              coupon={item}
              toggling={togglingId === item.id}
              onToggle={() => toggleMutation.mutate(item.id)}
              onDelete={() => handleDelete(item)}
            />
          )}
        />
      )}

      {/* Create bottom sheet */}
      <Modal visible={showSheet} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.sheetOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.sheetBackdrop} onPress={() => { setShowSheet(false); setFormError('') }} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />

            {/* Sheet header */}
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderIcon}>
                <Ionicons name="ticket-outline" size={20} color={PRIMARY} />
              </View>
              <View>
                <Text style={styles.sheetTitle}>Novo cupom</Text>
                <Text style={styles.sheetSub}>Preencha os dados do cupom de desconto</Text>
              </View>
              <TouchableOpacity style={styles.sheetClose} onPress={() => setShowSheet(false)}>
                <Ionicons name="close" size={18} color={MUTED} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Code */}
              <Text style={styles.fieldLabel}>Código <Text style={styles.req}>*</Text></Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={form.code}
                onChangeText={(t) => setField('code')(t.toUpperCase())}
                placeholder="ex: PROMO10"
                placeholderTextColor={MUTED}
                autoCapitalize="characters"
                maxLength={20}
              />

              {/* Description */}
              <Text style={styles.fieldLabel}>Descrição</Text>
              <TextInput
                style={styles.input}
                value={form.description}
                onChangeText={setField('description')}
                placeholder="ex: 10% de desconto no seu pedido"
                placeholderTextColor={MUTED}
              />

              {/* Discount type toggle */}
              <Text style={styles.fieldLabel}>Tipo de desconto <Text style={styles.req}>*</Text></Text>
              <View style={styles.typeToggle}>
                <TouchableOpacity
                  style={[styles.typeBtn, form.discountType === 'percent' && styles.typeBtnActive]}
                  onPress={() => setForm((p) => ({ ...p, discountType: 'percent' }))}
                  activeOpacity={0.8}
                >
                  <Ionicons name="trending-down-outline" size={16} color={form.discountType === 'percent' ? '#fff' : MUTED} />
                  <Text style={[styles.typeBtnText, form.discountType === 'percent' && styles.typeBtnTextActive]}>Porcentagem</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, form.discountType === 'fixed' && styles.typeBtnActive]}
                  onPress={() => setForm((p) => ({ ...p, discountType: 'fixed' }))}
                  activeOpacity={0.8}
                >
                  <Ionicons name="cash-outline" size={16} color={form.discountType === 'fixed' ? '#fff' : MUTED} />
                  <Text style={[styles.typeBtnText, form.discountType === 'fixed' && styles.typeBtnTextActive]}>Valor fixo (R$)</Text>
                </TouchableOpacity>
              </View>

              {/* Discount value */}
              <Text style={styles.fieldLabel}>
                {form.discountType === 'percent' ? 'Percentual (%)' : 'Valor (R$)'}
                {form.freeShipping
                  ? <Text style={styles.optHint}>  (opcional com frete grátis)</Text>
                  : <Text style={styles.req}> *</Text>}
              </Text>
              <TextInput
                style={styles.input}
                value={form.discountValue}
                onChangeText={setField('discountValue')}
                placeholder={form.discountType === 'percent' ? 'ex: 10' : 'ex: 5.00'}
                placeholderTextColor={MUTED}
                keyboardType="decimal-pad"
              />

              {/* Frete grátis (loja absorve a entrega) */}
              <TouchableOpacity
                style={[styles.freeShipRow, form.freeShipping && styles.freeShipRowActive]}
                onPress={() => setForm((p) => ({ ...p, freeShipping: !p.freeShipping }))}
                activeOpacity={0.85}
              >
                <View style={styles.freeShipLeft}>
                  <Ionicons name="bicycle" size={18} color={form.freeShipping ? PRIMARY : MUTED} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.freeShipTitle, form.freeShipping && { color: PRIMARY }]}>Frete grátis</Text>
                    <Text style={styles.freeShipSub}>A loja paga a entrega — o cliente não paga o frete</Text>
                  </View>
                </View>
                <View style={[styles.freeShipSwitch, form.freeShipping && styles.freeShipSwitchOn]}>
                  <View style={[styles.freeShipKnob, form.freeShipping && styles.freeShipKnobOn]} />
                </View>
              </TouchableOpacity>

              {/* Optional fields row */}
              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Pedido mínimo</Text>
                  <TextInput
                    style={styles.input}
                    value={form.minOrderValue}
                    onChangeText={setField('minOrderValue')}
                    placeholder="R$ 0,00"
                    placeholderTextColor={MUTED}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.fieldLabel}>Limite de usos</Text>
                  <TextInput
                    style={styles.input}
                    value={form.maxUses}
                    onChangeText={setField('maxUses')}
                    placeholder="Ilimitado"
                    placeholderTextColor={MUTED}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              {/* Expiry date */}
              <Text style={styles.fieldLabel}>Validade (DD/MM/AAAA)</Text>
              <TextInput
                style={styles.input}
                value={form.expiresAt}
                onChangeText={(v) => setField('expiresAt')(maskDateBR(v))}
                keyboardType="numeric"
                maxLength={10}
                placeholder="ex: 31/12/2025"
                placeholderTextColor={MUTED}
              />

              {formError ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={16} color={DANGER} />
                  <Text style={styles.errorText}>{formError}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.saveBtn, createMutation.isPending && styles.saveBtnLoading]}
                onPress={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                activeOpacity={0.85}
              >
                {createMutation.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                      <Text style={styles.saveBtnText}>Criar cupom</Text>
                    </>
                  )
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: BORDER,
    backgroundColor: CARD,
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: TEXT, letterSpacing: -0.5 },
  headerSub: { fontSize: 12, color: MUTED, marginTop: 1 },
  addBtn: {
    width: 42, height: 42, borderRadius: 13,
    backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center',
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35, shadowRadius: 6, elevation: 4,
  },

  filterRow: {
    flexDirection: 'row', backgroundColor: CARD,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 8,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#F5F0EC',
  },
  filterTabActive: { backgroundColor: PRIMARY },
  filterTabText: { fontSize: 12, fontWeight: '700', color: MUTED },
  filterTabTextActive: { color: '#fff' },

  list: { padding: 16, gap: 12 },
  listEmpty: { flex: 1 },

  // Ticket card
  ticket: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: BORDER,
  },
  ticketInactive: { opacity: 0.65 },
  ticketStripe: { width: 6 },
  perfColumn: {
    width: 18, paddingVertical: 10,
    justifyContent: 'space-around', alignItems: 'center',
    borderRightWidth: 1, borderRightColor: BORDER,
    borderStyle: 'dashed',
  },
  perfDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: BG, borderWidth: 1, borderColor: BORDER,
  },
  ticketBody: { flex: 1, padding: 14 },

  ticketTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 },
  ticketCodeWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  ticketCode: { fontSize: 18, fontWeight: '900', color: TEXT, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11, fontWeight: '700' },
  discountBadge: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  discountBadgeText: { fontSize: 13, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },

  ticketDesc: { fontSize: 12, color: MUTED, marginBottom: 8, lineHeight: 17 },

  ticketMeta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: BG, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: BORDER,
  },
  metaChipDanger: { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  metaChipText: { fontSize: 11, color: MUTED, fontWeight: '600' },

  ticketBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  usesText: { fontSize: 12, color: MUTED, fontWeight: '600' },
  ticketActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deleteBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#FFF0F0', alignItems: 'center', justifyContent: 'center',
  },

  // Empty state
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTicket: {
    flexDirection: 'row', overflow: 'hidden',
    borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    backgroundColor: CARD, marginBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  emptyTicketStripe: { width: 8, backgroundColor: '#E5DDD8' },
  emptyTicketPerf: {
    width: 18, paddingVertical: 10,
    justifyContent: 'space-around', alignItems: 'center',
    borderRightWidth: 1, borderRightColor: BORDER, borderStyle: 'dashed',
  },
  emptyTicketBody: { padding: 20, gap: 6 },
  emptyCode: { fontSize: 20, fontWeight: '900', color: '#D4C8C2', letterSpacing: 2 },
  emptyDiscount: { fontSize: 13, fontWeight: '600', color: '#D4C8C2' },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: TEXT, marginBottom: 8, textAlign: 'center' },
  emptySub: { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: PRIMARY, borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 14,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  // Bottom sheet
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '90%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12, shadowRadius: 20, elevation: 20,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#DDD', alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  sheetHeaderIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#FFF0EB', alignItems: 'center', justifyContent: 'center',
  },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: TEXT },
  sheetSub: { fontSize: 12, color: MUTED, marginTop: 1 },
  sheetClose: {
    marginLeft: 'auto', width: 32, height: 32, borderRadius: 8,
    backgroundColor: BG, alignItems: 'center', justifyContent: 'center',
  },
  sheetScroll: { paddingHorizontal: 20, paddingTop: 16 },

  fieldLabel: { fontSize: 13, fontWeight: '700', color: TEXT, marginBottom: 6 },
  req: { color: PRIMARY },
  optHint: { color: MUTED, fontWeight: '600', fontSize: 11 },

  freeShipRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 14, gap: 10,
  },
  freeShipRowActive: { borderColor: PRIMARY, backgroundColor: '#FFF3EB' },
  freeShipLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  freeShipTitle: { fontSize: 14, fontWeight: '800', color: TEXT },
  freeShipSub: { fontSize: 11, color: MUTED, marginTop: 1, lineHeight: 15 },
  freeShipSwitch: {
    width: 44, height: 26, borderRadius: 13, backgroundColor: '#E5DDD5',
    padding: 3, justifyContent: 'center',
  },
  freeShipSwitchOn: { backgroundColor: PRIMARY },
  freeShipKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  freeShipKnobOn: { alignSelf: 'flex-end' },
  input: {
    backgroundColor: BG, borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: TEXT, marginBottom: 16,
  },
  codeInput: { fontSize: 16, fontWeight: '800', letterSpacing: 2 },

  typeToggle: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 12, paddingVertical: 12,
    backgroundColor: CARD,
  },
  typeBtnActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  typeBtnText: { fontSize: 13, fontWeight: '700', color: MUTED },
  typeBtnTextActive: { color: '#fff' },

  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFF5F5', borderRadius: 10,
    borderWidth: 1, borderColor: '#FCA5A5',
    padding: 12, marginBottom: 16,
  },
  errorText: { flex: 1, fontSize: 13, color: DANGER, fontWeight: '600' },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 15,
    marginBottom: 8,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  saveBtnLoading: { opacity: 0.75 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
})
