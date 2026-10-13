import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, Modal, ScrollView, Switch,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as Location from 'expo-location'
import { api } from '../src/api/client'
import { colors } from '../src/theme/colors'
import { useToast } from '../src/components/Toast'

interface Address {
  id: string
  label: string
  street: string
  number: string
  complement?: string
  district: string
  city: string
  state: string
  zipCode: string
  lat: number
  lng: number
  isDefault: boolean
}

interface AddressForm {
  label: string
  zipCode: string
  street: string
  number: string
  complement: string
  district: string
  city: string
  state: string
  isDefault: boolean
}

const EMPTY_FORM: AddressForm = {
  label: '', zipCode: '', street: '', number: '',
  complement: '', district: '', city: '', state: '', isDefault: false,
}

async function fetchAddresses(): Promise<Address[]> {
  const { data } = await api.get('/users/me/addresses')
  return data
}

async function lookupCep(cep: string) {
  const clean = cep.replace(/\D/g, '')
  if (clean.length !== 8) return null
  const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`)
  const data = await res.json()
  if (data.erro) return null
  return data
}

export default function AddressesScreen() {
  const insets = useSafeAreaInsets()
  const { show: toast } = useToast()
  const queryClient = useQueryClient()
  const [modalVisible, setModalVisible] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM)
  const [loadingCep, setLoadingCep] = useState(false)
  const [gettingLocation, setGettingLocation] = useState(false)

  const { data: addresses, isLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: fetchAddresses,
  })

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post('/users/me/addresses', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['addresses'] }); closeModal() },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast(Array.isArray(msg) ? msg.join('\n') : (msg ?? 'Não foi possível salvar.'), 'error')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => api.patch(`/users/me/addresses/${id}`, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['addresses'] }); closeModal() },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast(Array.isArray(msg) ? msg.join('\n') : (msg ?? 'Não foi possível salvar.'), 'error')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/me/addresses/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['addresses'] }),
    onError: () => toast('Não foi possível excluir o endereço.', 'error'),
  })

  function openNew() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalVisible(true)
  }

  function openEdit(addr: Address) {
    setEditingId(addr.id)
    setForm({
      label: addr.label,
      zipCode: addr.zipCode,
      street: addr.street,
      number: addr.number,
      complement: addr.complement ?? '',
      district: addr.district,
      city: addr.city,
      state: addr.state,
      isDefault: addr.isDefault,
    })
    setModalVisible(true)
  }

  function closeModal() {
    setModalVisible(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function setField<K extends keyof AddressForm>(key: K, value: AddressForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleCepBlur() {
    const clean = form.zipCode.replace(/\D/g, '')
    if (clean.length !== 8) return
    setLoadingCep(true)
    try {
      const data = await lookupCep(clean)
      if (data) {
        setForm((prev) => ({
          ...prev,
          street: data.logradouro || prev.street,
          district: data.bairro || prev.district,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
        }))
        // Warn when CEP exists but has no street registered (e.g. rural areas)
        if (!data.logradouro) {
          toast('Este CEP é válido, mas não tem rua registrada no sistema. Preencha o endereço manualmente.', 'error')
        }
      } else {
        toast('Verifique o CEP e tente novamente.', 'error')
      }
    } finally {
      setLoadingCep(false)
    }
  }

  /**
   * Coordenadas do endereço. Quando o GPS não está disponível caímos no centro de
   * Vilhena — mas devolvemos `approximate: true`, porque a TAXA DE ENTREGA é
   * calculada por km: salvar em silêncio fazia o cliente pagar frete errado e o
   * entregador ir para o lugar errado.
   */
  async function getCurrentCoords(): Promise<{ lat: number; lng: number; approximate: boolean }> {
    const FALLBACK = { lat: -12.7406, lng: -60.1457, approximate: true } // centro de Vilhena-RO
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') return FALLBACK

    setGettingLocation(true)
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      return { lat: loc.coords.latitude, lng: loc.coords.longitude, approximate: false }
    } catch {
      return FALLBACK
    } finally {
      setGettingLocation(false)
    }
  }

  /** Confirma com o usuário antes de salvar um endereço sem localização real. */
  function confirmApproximate(): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert(
        'Não conseguimos sua localização',
        'Sem o GPS, o endereço é salvo com a posição aproximada do centro de Vilhena. '
        + 'Como a taxa de entrega é calculada por distância, o valor pode sair errado. '
        + 'Ative a localização e tente de novo, ou salve assim mesmo.',
        [
          { text: 'Tentar de novo', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Salvar assim mesmo', onPress: () => resolve(true) },
        ],
      )
    })
  }

  async function handleSave() {
    if (!form.label.trim()) { toast('Informe um nome para o endereço (ex: Casa, Trabalho).', 'info'); return }
    if (!form.street.trim() || !form.number.trim() || !form.city.trim()) {
      toast('Preencha rua, número e cidade.', 'info')
      return
    }

    const coords = await getCurrentCoords()
    if (coords.approximate && !(await confirmApproximate())) return

    const payload = {
      label: form.label.trim(),
      zipCode: form.zipCode.replace(/\D/g, ''),
      street: form.street.trim(),
      number: form.number.trim(),
      complement: form.complement.trim() || undefined,
      district: form.district.trim(),
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      lat: coords.lat,
      lng: coords.lng,
      isDefault: form.isDefault,
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  function confirmDelete(id: string, label: string) {
    Alert.alert('Excluir endereço', `Deseja excluir "${label}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
    ])
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color="#1A0A00" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meus endereços</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openNew} activeOpacity={0.8}>
          <Ionicons name="add" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={(a) => a.id}
          contentContainerStyle={addresses?.length ? styles.list : styles.listEmpty}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="location-outline" size={40} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Nenhum endereço</Text>
              <Text style={styles.emptySub}>Adicione um endereço de entrega para facilitar seus pedidos.</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={openNew} activeOpacity={0.85}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.emptyBtnText}>Adicionar endereço</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardLeft}>
                <View style={[styles.cardIcon, item.isDefault && styles.cardIconDefault]}>
                  <Ionicons name="location" size={18} color={item.isDefault ? '#fff' : colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardLabel}>{item.label}</Text>
                    {item.isDefault && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>Padrão</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.cardAddr} numberOfLines={1}>
                    {item.street}, {item.number}{item.complement ? `, ${item.complement}` : ''}
                  </Text>
                  <Text style={styles.cardCity}>{item.district} · {item.city}/{item.state}</Text>
                </View>
              </View>
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)} activeOpacity={0.7}>
                  <Ionicons name="create-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDelete(item.id, item.label)} activeOpacity={0.7}>
                  <Ionicons name="trash-outline" size={18} color="#DC2626" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeModal}>
        <View style={[styles.modal, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeModal} activeOpacity={0.7}>
              <Ionicons name="close" size={24} color="#1A0A00" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editingId ? 'Editar endereço' : 'Novo endereço'}</Text>
            <TouchableOpacity onPress={handleSave} disabled={isSaving} activeOpacity={0.8}>
              {isSaving || gettingLocation
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={styles.modalSave}>Salvar</Text>
              }
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={[styles.modalContent, { paddingBottom: 120 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <MField label="Nome do endereço" value={form.label} onChangeText={(v) => setField('label', v)} placeholder="Casa, Trabalho, etc." />

            <View style={styles.cepRow}>
              <View style={{ flex: 1 }}>
                <MField
                  label="CEP"
                  value={form.zipCode}
                  onChangeText={(v) => setField('zipCode', v.replace(/\D/g, '').slice(0, 8))}
                  placeholder="00000-000"
                  keyboardType="numeric"
                  onBlur={handleCepBlur}
                />
              </View>
              {loadingCep && <ActivityIndicator color={colors.primary} style={{ marginTop: 28 }} />}
            </View>

            <MField label="Rua / Avenida" value={form.street} onChangeText={(v) => setField('street', v)} placeholder="Rua das Flores" />

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <MField label="Número" value={form.number} onChangeText={(v) => setField('number', v)} placeholder="123" keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <MField label="Complemento" value={form.complement} onChangeText={(v) => setField('complement', v)} placeholder="Apto 4" />
              </View>
            </View>

            <MField label="Bairro" value={form.district} onChangeText={(v) => setField('district', v)} placeholder="Centro" />

            <View style={styles.rowFields}>
              <View style={{ flex: 2 }}>
                <MField label="Cidade" value={form.city} onChangeText={(v) => setField('city', v)} placeholder="Vilhena" />
              </View>
              <View style={{ flex: 1 }}>
                <MField label="Estado" value={form.state} onChangeText={(v) => setField('state', v.toUpperCase().slice(0, 2))} placeholder="RO" />
              </View>
            </View>

            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchLabel}>Endereço padrão</Text>
                <Text style={styles.switchSub}>Usado automaticamente no checkout</Text>
              </View>
              <Switch
                value={form.isDefault}
                onValueChange={(v) => setField('isDefault', v)}
                trackColor={{ true: colors.primary }}
                thumbColor="#fff"
              />
            </View>

            <View style={styles.locationNote}>
              <Ionicons name="navigate-outline" size={14} color="#2563EB" />
              <Text style={styles.locationNoteText}>
                Sua localização GPS atual será usada para calcular distâncias de entrega.
              </Text>
            </View>
          </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  )
}

function MField({
  label, value, onChangeText, placeholder, keyboardType, onBlur,
}: {
  label: string
  value: string
  onChangeText: (v: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'numeric' | 'phone-pad'
  onBlur?: () => void
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#C0B0A8"
        keyboardType={keyboardType ?? 'default'}
        onBlur={onBlur}
        autoCapitalize="sentences"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#F0E8E2',
    gap: 10,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: '#F0EBE5',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: '#1A0A00' },
  addBtn: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },

  list: { padding: 16, gap: 12 },
  listEmpty: { flex: 1, padding: 16 },

  card: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 16, flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardIcon: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  cardIconDefault: { backgroundColor: colors.primary },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  cardLabel: { fontSize: 15, fontWeight: '700', color: '#1A0A00' },
  defaultBadge: {
    backgroundColor: colors.primaryLight, borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  defaultBadgeText: { fontSize: 10, fontWeight: '800', color: colors.primary },
  cardAddr: { fontSize: 13, color: '#1A0A00', fontWeight: '500' },
  cardCity: { fontSize: 12, color: '#9A8880', marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 4, marginLeft: 8 },
  actionBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F5F0EC',
    alignItems: 'center', justifyContent: 'center',
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#1A0A00', marginBottom: 8 },
  emptySub: { fontSize: 14, color: '#9A8880', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14,
  },
  emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  // Modal
  modal: { flex: 1, backgroundColor: '#F5F5F5' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#F0E8E2',
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#1A0A00' },
  modalSave: { fontSize: 15, fontWeight: '700', color: colors.primary },
  modalContent: { padding: 20, gap: 4 },

  cepRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  rowFields: { flexDirection: 'row', gap: 12 },

  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#9A8880', marginBottom: 6, letterSpacing: 0.3 },
  fieldInput: {
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1A0A00',
    borderWidth: 1.5, borderColor: '#EDE5DF',
  },

  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14,
    borderWidth: 1.5, borderColor: '#EDE5DF',
  },
  switchLabel: { fontSize: 15, fontWeight: '700', color: '#1A0A00', marginBottom: 2 },
  switchSub: { fontSize: 12, color: '#9A8880' },

  locationNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12,
  },
  locationNoteText: { flex: 1, fontSize: 12, color: '#2563EB', lineHeight: 17 },
})
