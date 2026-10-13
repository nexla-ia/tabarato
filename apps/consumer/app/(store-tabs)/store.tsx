import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, Image, Animated, Linking, AppState,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { useAuthStore } from '../../src/stores/auth.store'
import { api } from '../../src/api/client'
import { uploadImageAsset } from '../../src/api/upload'
import { colors } from '../../src/theme/colors'
import { useToast } from '../../src/components/Toast'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

interface DaySchedule {
  open: boolean
  from: string
  to: string
}

interface Category { id: string; name: string; icon?: string }

// Ao sair do campo, completa o horário: "17" -> "17:00", "1" -> "01:00",
// "175" -> "17:50". Vazio permanece vazio.
function normalizeTime(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 4)
  if (!d) return ''
  const h = Math.min(parseInt(d.slice(0, 2), 10) || 0, 23)
  const m = d.length <= 2 ? 0 : Math.min(parseInt(d.slice(2).padEnd(2, '0'), 10) || 0, 59)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function SectionHeader({ icon, title }: { icon: IoniconName; title: string }) {
  return (
    <View style={section.header}>
      <View style={section.iconWrap}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={section.title}>{title}</Text>
    </View>
  )
}

function Field({
  label, value, onChangeText, placeholder, keyboardType, multiline,
}: {
  label: string
  value: string
  onChangeText: (v: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric'
  multiline?: boolean
}) {
  return (
    <View style={field.wrap}>
      <Text style={field.label}>{label}</Text>
      <TextInput
        style={[field.input, multiline && field.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#C0B0A8"
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
      />
    </View>
  )
}

export default function StoreSettingsScreen() {
  const { show: toast } = useToast()
  const { user, clearAuth } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const toastY = useRef(new Animated.Value(-80)).current
  const [toastVisible, setToastVisible] = useState(false)

  const [logoUrl, setLogoUrl] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [deliveryRadius, setDeliveryRadius] = useState('5')
  const [prepTime, setPrepTime] = useState('30')
  const [maxConcurrent, setMaxConcurrent] = useState('')
  const [exceptions, setExceptions] = useState<{ date: string; closed: boolean }[]>([])
  const [addingException, setAddingException] = useState(false)
  const [exceptionDate, setExceptionDate] = useState('')
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])

  const [schedule, setSchedule] = useState<DaySchedule[]>(
    DAYS.map((_, i) => ({ open: i >= 1 && i <= 6, from: '08:00', to: '22:00' }))
  )

  // Mercado Pago (split)
  const [mp, setMp] = useState<{ enabled: boolean; connected: boolean }>({ enabled: false, connected: false })
  const [mpLoading, setMpLoading] = useState(false)

  const fetchMpStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/stores/mp/status')
      setMp({ enabled: !!data.enabled, connected: !!data.connected })
    } catch {}
  }, [])

  async function connectMp() {
    setMpLoading(true)
    try {
      // origin=app → o callback mostra a página "Voltar ao app" (deep link) em
      // vez de jogar no painel web.
      const { data } = await api.get('/stores/mp/connect', { params: { origin: 'app' } })
      await Linking.openURL(data.url)
    } catch {
      toast('Não foi possível iniciar a conexão. Tente novamente.', 'error')
    } finally {
      setMpLoading(false)
    }
  }

  function disconnectMp() {
    Alert.alert('Desconectar Mercado Pago?', 'Você não poderá receber pedidos até reconectar.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desconectar', style: 'destructive',
        onPress: async () => { try { await api.get('/stores/mp/disconnect') } catch {}; fetchMpStatus() },
      },
    ])
  }

  // Asaas — recebimentos (split por subconta): a parte da loja cai direto na conta dela.
  const [asaas, setAsaas] = useState<{ required: boolean; onboarded: boolean }>({ required: false, onboarded: false })
  const [asaasFormOpen, setAsaasFormOpen] = useState(false)
  const [asaasSubmitting, setAsaasSubmitting] = useState(false)
  const [asaasForm, setAsaasForm] = useState({ postalCode: '', addressNumber: '', province: '', incomeValue: '', companyType: 'MEI', address: '' })
  const [cepLoading, setCepLoading] = useState(false)

  // Autofill do endereço pelo CEP (ViaCEP) — preenche bairro e logradouro.
  async function lookupCep(cep: string) {
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const via = await res.json()
      if (!via?.erro) {
        setAsaasForm(f => ({
          ...f,
          province: via.bairro || f.province,
          address: via.logradouro || f.address,
        }))
      }
    } catch { /* deixa o usuário preencher na mão */ } finally { setCepLoading(false) }
  }

  const fetchAsaasStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/stores/my/asaas/status')
      setAsaas({ required: !!data.required, onboarded: !!data.onboarded })
    } catch {}
  }, [])

  async function submitAsaasOnboard() {
    const income = Math.round(Number(String(asaasForm.incomeValue).replace(/[^\d]/g, '')))
    if (!asaasForm.postalCode || !asaasForm.addressNumber || !asaasForm.province || !income) {
      toast('Preencha CEP, número, bairro e faturamento estimado.', 'error'); return
    }
    setAsaasSubmitting(true)
    try {
      await api.post('/stores/my/asaas/onboard', {
        postalCode: asaasForm.postalCode,
        addressNumber: asaasForm.addressNumber,
        province: asaasForm.province,
        incomeValue: income,
        companyType: asaasForm.companyType,
        address: asaasForm.address || undefined,
      })
      toast('Recebimentos configurados! Sua parte cai direto na sua conta.', 'success')
      setAsaasFormOpen(false)
      fetchAsaasStatus()
    } catch (e: any) {
      toast(e?.response?.data?.message ?? 'Não foi possível configurar. Confira os dados.', 'error')
    } finally { setAsaasSubmitting(false) }
  }


  const fetchStore = useCallback(async () => {
    try {
      const { data } = await api.get('/stores/my')
      setLogoUrl(data.logoUrl ?? '')
      setPhotos(data.photos ?? [])
      setName(data.name ?? '')
      setDescription(data.description ?? '')
      setPhone(data.phone ?? '')
      setAddress(data.address ?? '')
      setDeliveryRadius(String(data.deliveryRadiusKm ?? 5))
      setPrepTime(String(data.prepTimeMin ?? 30))
      setMaxConcurrent(data.maxConcurrentOrders != null ? String(data.maxConcurrentOrders) : '')
      if (Array.isArray(data.categories)) setSelectedCategoryIds(data.categories.map((c: Category) => c.id))
      if (Array.isArray(data.scheduleExceptions)) setExceptions(data.scheduleExceptions)
      if (Array.isArray(data.openingHours) && data.openingHours.length === 7) {
        setSchedule(data.openingHours)
      }
    } catch (err: any) {
      if (err.response?.status !== 404) {
        toast('Não foi possível carregar os dados da loja.', 'error')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  async function pickLogo() {
    try {
      await ImagePicker.requestMediaLibraryPermissionsAsync()
      // SEM allowsEditing (corte trava no Android). uploadImageAsset já
      // redimensiona/converte pra JPEG e envia pelo uploader nativo.
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 })
      if (result.canceled) return
      const asset = result.assets?.[0]
      if (!asset?.uri) { toast('Não consegui ler a imagem selecionada. Tente escolher outra.', 'error'); return }
      setUploadingLogo(true)
      const url = await uploadImageAsset(asset.uri, { name: 'logo.jpg' })
      setLogoUrl(url)
      await api.patch('/stores/my', { logoUrl: url })
    } catch (err: any) {
      toast(err?.response?.data?.message ?? err?.message ?? 'Não foi possível enviar a foto.', 'error')
    } finally {
      setUploadingLogo(false)
    }
  }

  async function pickPhoto() {
    if (photos.length >= 6) { toast('Você pode ter no máximo 6 fotos da loja.', 'info'); return }
    try {
      await ImagePicker.requestMediaLibraryPermissionsAsync()
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 })
      if (result.canceled) return
      const asset = result.assets?.[0]
      if (!asset?.uri) { toast('Não consegui ler a imagem selecionada. Tente escolher outra.', 'error'); return }
      setUploadingPhoto(true)
      const url = await uploadImageAsset(asset.uri, { name: 'photo.jpg' })
      const next = [...photos, url]
      setPhotos(next)
      await api.patch('/stores/my', { photos: next })
    } catch (err: any) {
      setPhotos(photos)
      toast(err?.response?.data?.message ?? err?.message ?? 'Não foi possível enviar.', 'error')
    } finally {
      setUploadingPhoto(false)
    }
  }

  function removePhoto(index: number) {
    Alert.alert('Remover foto', 'Deseja remover esta foto? A alteração será salva automaticamente.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          // Capture snapshot INSIDE onPress to avoid stale closure
          // (if user uploaded another photo while Alert was open, this captures the fresh state)
          const snapshot = [...photos]
          const newPhotos = snapshot.filter((_, i) => i !== index)
          setPhotos(newPhotos)
          try {
            await api.patch('/stores/my', { photos: newPhotos })
          } catch {
            setPhotos(snapshot)
            Alert.alert('Erro', 'Não foi possível remover a foto.')
          }
        },
      },
    ])
  }

  const fetchCategories = useCallback(async () => {
    try {
      const { data } = await api.get<Category[]>('/stores/categories')
      setAllCategories(data)
    } catch {}
  }, [])

  useEffect(() => { fetchStore() }, [fetchStore])
  useEffect(() => { fetchMpStatus() }, [fetchMpStatus])
  useEffect(() => { fetchAsaasStatus() }, [fetchAsaasStatus])
  // Ao voltar pro app (ex.: depois de conectar o MP no navegador), rebusca o
  // status pra refletir "Conta conectada" sem precisar apertar nada.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') fetchMpStatus() })
    return () => sub.remove()
  }, [fetchMpStatus])
  useEffect(() => { fetchCategories() }, [fetchCategories])
  // Garante que o toast começa escondido toda vez que a tela é focada
  // (evita ele ficar "preso" visível ao voltar pra config).
  useFocusEffect(useCallback(() => { setToastVisible(false); toastY.setValue(-80) }, [toastY]))

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  function toggleDay(i: number) {
    const day = schedule[i]
    if (day.open) {
      Alert.alert(
        `Fechar ${DAYS[i]}?`,
        'A loja ficará fechada neste dia automaticamente.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Fechar',
            style: 'destructive',
            onPress: () => setSchedule((prev) => prev.map((d, idx) => (idx === i ? { ...d, open: false } : d))),
          },
        ]
      )
    } else {
      setSchedule((prev) => prev.map((d, idx) => (idx === i ? { ...d, open: true } : d)))
    }
  }

  function showToast() {
    toastY.stopAnimation()
    toastY.setValue(-80)
    setToastVisible(true)
    Animated.spring(toastY, { toValue: 0, useNativeDriver: true, bounciness: 8 }).start()
    setTimeout(() => {
      Animated.timing(toastY, { toValue: -80, duration: 250, useNativeDriver: true }).start(() => {
        setToastVisible(false)
      })
    }, 1800)
  }

  const [updatingLocation, setUpdatingLocation] = useState(false)
  const [locationOk, setLocationOk] = useState(false)

  async function handleUpdateLocation() {
    setUpdatingLocation(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        toast('Ative a localização nas configurações do dispositivo.', 'error')
        return
      }
      const servicesOn = await Location.hasServicesEnabledAsync()
      if (!servicesOn) {
        toast('Ative a localização (GPS) do aparelho e tente novamente.', 'info')
        return
      }
      // Balanced (wifi/rede + GPS) funciona em tablets sem chip de GPS; cai pra
      // última posição conhecida se a leitura ao vivo falhar.
      let loc = null
      try {
        loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      } catch {
        loc = await Location.getLastKnownPositionAsync()
      }
      if (!loc) {
        toast('Sem sinal de localização agora. Vá para um local mais aberto e tente novamente.', 'error')
        return
      }
      // Reverse-geocode → preenche o campo de endereço automaticamente (só se vazio,
      // pra não sobrescrever o que o lojista digitou).
      let addressLine = ''
      try {
        const [p] = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
        if (p) addressLine = [p.street, p.streetNumber, p.district, p.city].filter(Boolean).join(', ')
      } catch {}
      if (addressLine && !address.trim()) setAddress(addressLine)

      await api.patch('/stores/my', {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        ...(addressLine && !address.trim() ? { address: addressLine } : {}),
      })
      setLocationOk(true)
      toast(addressLine ? `Endereço: ${addressLine}` : `Coordenadas salvas: ${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`, 'success')
    } catch {
      toast('Não foi possível obter a localização. Verifique se a localização do aparelho está ativa.', 'error')
    } finally {
      setUpdatingLocation(false)
    }
  }

  function validateTime(t: string): boolean {
    const parts = t.split(':')
    if (parts.length !== 2) return false
    const h = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10)
    return !isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59
  }

  async function handleSave() {
    // Validate schedule before saving
    for (let i = 0; i < schedule.length; i++) {
      if (!schedule[i].open) continue
      if (!validateTime(schedule[i].from) || !validateTime(schedule[i].to)) {
        toast(`Horário do ${DAYS[i]} inválido. Use o formato HH:MM (ex: 08:00).`, 'error')
        return
      }
    }
    setSaving(true)
    try {
      // Só envia fotos que são URLs válidas — uma entrada inválida (uri local /
      // legada) faria a API rejeitar o PATCH inteiro e NADA salvaria.
      const safePhotos = photos.filter((p) => /^https?:\/\//.test(p))
      await api.patch('/stores/my', {
        name: name.trim(),
        description: description.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        deliveryRadiusKm: Number(deliveryRadius) || 5,
        prepTimeMin: Number(prepTime) || 30,
        openingHours: schedule,
        scheduleExceptions: exceptions,
        photos: safePhotos,
        maxConcurrentOrders: maxConcurrent ? parseInt(maxConcurrent, 10) : null,
        categoryIds: selectedCategoryIds,
      })
      await fetchStore() // re-sincroniza com o servidor (confirma que salvou)
      showToast()
    } catch (err: any) {
      const msg = err.response?.data?.message
      toast(Array.isArray(msg) ? msg.join('\n') : (msg ?? 'Não foi possível salvar.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleLogout() {
    Alert.alert('Sair da conta', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await clearAuth()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  const initial = user?.name?.[0]?.toUpperCase() ?? 'L'
  const nameParts = user?.name?.split(' ') ?? []
  const firstName = nameParts[0] ?? 'Lojista'
  const lastName = nameParts.slice(1).join(' ')

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
    {toastVisible && (
      <Animated.View style={[styles.toast, { transform: [{ translateY: toastY }] }]} pointerEvents="none">
        <Ionicons name="checkmark-circle" size={20} color="#fff" />
        <Text style={styles.toastText}>Configurações salvas!</Text>
      </Animated.View>
    )}
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* Profile card */}
      <View style={styles.profileCard}>
        <View style={styles.profileDecor} />
        <TouchableOpacity style={styles.avatarWrap} onPress={pickLogo} activeOpacity={0.85}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            {uploadingLogo
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="camera" size={14} color="#fff" />
            }
          </View>
        </TouchableOpacity>
        <Text style={styles.profileName}>
          {firstName}{lastName ? <Text style={styles.profileNameLight}> {lastName}</Text> : null}
        </Text>
        <Text style={styles.profileEmail}>{user?.email}</Text>
        <View style={styles.ownerBadge}>
          <Ionicons name="storefront-outline" size={12} color={colors.primary} />
          <Text style={styles.ownerBadgeText}>Lojista</Text>
        </View>
      </View>

      {/* OBRIGATÓRIO: conectar o Mercado Pago (só quando o marketplace está ativo).
          Enquanto não conecta, a loja não recebe pedidos (bloqueado no backend). */}
      {mp.enabled && !mp.connected && (
        <TouchableOpacity
          style={styles.mpRequiredBanner}
          onPress={connectMp}
          disabled={mpLoading}
          activeOpacity={0.9}
        >
          <View style={styles.mpRequiredIcon}>
            {mpLoading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Ionicons name="card" size={20} color="#fff" />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.mpRequiredTitle}>Conecte o Mercado Pago · obrigatório</Text>
            <Text style={styles.mpRequiredSub}>
              Sua loja só abre e recebe pedidos depois de conectar. Cadastre também uma chave PIX na sua conta Mercado Pago para receber por PIX. Toque para conectar.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#B91C1C" />
        </TouchableOpacity>
      )}

      {/* Fotos da loja */}
      <View style={styles.card}>
        <SectionHeader icon="images-outline" title="Fotos da loja" />
        <Text style={styles.photosHint}>Adicione até 6 fotos do seu estabelecimento para atrair clientes.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosRow}>
          {photos.map((uri, index) => (
            <View key={uri + index} style={styles.photoThumb}>
              <Image source={{ uri }} style={styles.photoImg} />
              <TouchableOpacity style={styles.photoDelete} onPress={() => removePhoto(index)} activeOpacity={0.8}>
                <Ionicons name="close" size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 6 && (
            <TouchableOpacity style={styles.photoAdd} onPress={pickPhoto} activeOpacity={0.8} disabled={uploadingPhoto}>
              {uploadingPhoto
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <>
                    <Ionicons name="add" size={24} color={colors.primary} />
                    <Text style={styles.photoAddText}>Adicionar</Text>
                  </>
              }
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* Informações da loja */}
      <View style={styles.card}>
        <SectionHeader icon="storefront-outline" title="Informações da loja" />
        <Field label="Nome da loja" value={name} onChangeText={setName} placeholder="Nome do seu estabelecimento" />
        <Field label="Descrição" value={description} onChangeText={setDescription} placeholder="Conte um pouco sobre sua loja..." multiline />
        <Field label="Telefone" value={phone} onChangeText={setPhone} placeholder="(69) 99999-0000" keyboardType="phone-pad" />
        <Field label="Endereço completo" value={address} onChangeText={setAddress} placeholder="Rua, número, bairro" />
      </View>

      {/* Categorias */}
      <View style={styles.card}>
        <SectionHeader icon="grid-outline" title="Categorias" />
        <Text style={styles.photosHint}>
          Escolha em quais categorias sua loja aparece. Sem categoria, a loja não é listada na aba "Categorias" do cliente.
        </Text>
        {allCategories.length === 0 ? (
          <Text style={styles.dayClosed}>Nenhuma categoria disponível.</Text>
        ) : (
          <View style={styles.catWrap}>
            {allCategories.map((cat) => {
              const active = selectedCategoryIds.includes(cat.id)
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catChip, active && styles.catChipActive]}
                  onPress={() => toggleCategory(cat.id)}
                  activeOpacity={0.8}
                >
                  {cat.icon ? (
                    <Ionicons
                      name={cat.icon as IoniconName}
                      size={14}
                      color={active ? '#fff' : colors.primary}
                    />
                  ) : null}
                  <Text style={[styles.catChipText, active && styles.catChipTextActive]}>{cat.name}</Text>
                  {active && <Ionicons name="checkmark" size={14} color="#fff" />}
                </TouchableOpacity>
              )
            })}
          </View>
        )}
      </View>

      {/* Localização */}
      <View style={styles.card}>
        <SectionHeader icon="locate-outline" title="Localização da loja" />
        <Text style={styles.locDesc}>
          A localização é usada para calcular a distância até o cliente e mostrar sua loja no mapa. Esteja fisicamente na loja ao atualizar.
        </Text>
        <TouchableOpacity
          style={[styles.locBtn, locationOk && styles.locBtnDone]}
          onPress={handleUpdateLocation}
          disabled={updatingLocation}
          activeOpacity={0.85}
        >
          {updatingLocation ? (
            <ActivityIndicator size="small" color={locationOk ? '#059669' : colors.primary} />
          ) : (
            <>
              <Ionicons
                name={locationOk ? 'checkmark-circle' : 'locate-outline'}
                size={17}
                color={locationOk ? '#059669' : colors.primary}
              />
              <Text style={[styles.locBtnText, locationOk && { color: '#059669' }]}>
                {locationOk ? 'Localização atualizada!' : 'Atualizar localização agora'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Entrega */}
      <View style={styles.card}>
        <SectionHeader icon="bicycle-outline" title="Entrega" />
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Field label="Raio de entrega (km)" value={deliveryRadius} onChangeText={setDeliveryRadius} keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Tempo de preparo (min)" value={prepTime} onChangeText={setPrepTime} keyboardType="numeric" />
          </View>
        </View>
      </View>


      {/* Recebimentos (Asaas split) — a parte da loja cai direto na conta dela */}
      {asaas.required && (
        <View style={styles.card}>
          <SectionHeader icon="card-outline" title="Recebimentos (PIX + cartão)" />
          {asaas.onboarded ? (
            <View style={styles.mpConnectedRow}>
              <View style={styles.mpBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#059669" />
                <Text style={styles.mpBadgeText}>Recebimentos configurados</Text>
              </View>
            </View>
          ) : !asaasFormOpen ? (
            <>
              <Text style={styles.mpDesc}>Configure para receber sua parte de cada venda direto na sua conta, automático. Depois, cadastre sua chave PIX de saque na Carteira.</Text>
              <View style={styles.mpWarnBox}>
                <Ionicons name="alert-circle-outline" size={15} color="#B45309" />
                <Text style={styles.mpWarnText}>Enquanto não configurar, sua loja pode não conseguir receber pedidos.</Text>
              </View>
              <TouchableOpacity style={styles.mpBtn} onPress={() => setAsaasFormOpen(true)} activeOpacity={0.85}>
                <Ionicons name="wallet-outline" size={18} color="#fff" /><Text style={styles.mpBtnText}>Configurar recebimentos</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.mpDesc}>Dados da empresa (usados só pra configurar seus recebimentos com segurança).</Text>
              <TextInput style={styles.input} placeholder={cepLoading ? 'Buscando endereço…' : 'CEP (preenche o endereço)'} placeholderTextColor="#B8A99E" keyboardType="numeric" value={asaasForm.postalCode} onChangeText={(v) => { const d = v.replace(/\D/g, '').slice(0, 8); setAsaasForm(f => ({ ...f, postalCode: d })); if (d.length === 8) lookupCep(d) }} />
              <TextInput style={styles.input} placeholder="Número do endereço" placeholderTextColor="#B8A99E" keyboardType="numeric" value={asaasForm.addressNumber} onChangeText={(v) => setAsaasForm(f => ({ ...f, addressNumber: v.slice(0, 10) }))} />
              <TextInput style={styles.input} placeholder="Bairro" placeholderTextColor="#B8A99E" value={asaasForm.province} onChangeText={(v) => setAsaasForm(f => ({ ...f, province: v }))} />
              <TextInput style={styles.input} placeholder="Faturamento mensal estimado (R$)" placeholderTextColor="#B8A99E" keyboardType="numeric" value={asaasForm.incomeValue} onChangeText={(v) => setAsaasForm(f => ({ ...f, incomeValue: v.replace(/\D/g, '') }))} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 4 }}>
                {[{ v: 'MEI', l: 'MEI' }, { v: 'LIMITED', l: 'LTDA / EIRELI' }].map((t) => (
                  <TouchableOpacity key={t.v} onPress={() => setAsaasForm(f => ({ ...f, companyType: t.v }))} style={[styles.companyChip, asaasForm.companyType === t.v && styles.companyChipActive]}>
                    <Text style={[styles.companyChipText, asaasForm.companyType === t.v && styles.companyChipTextActive]}>{t.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.mpBtn} onPress={submitAsaasOnboard} disabled={asaasSubmitting} activeOpacity={0.85}>
                {asaasSubmitting ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={styles.mpBtnText}>Salvar recebimentos</Text></>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAsaasFormOpen(false)} style={styles.mpRefresh}>
                <Text style={styles.mpRefreshText}>Cancelar</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Mercado Pago — split (só aparece quando o marketplace está ativo) */}
      {mp.enabled && (
        <View style={styles.card}>
          <SectionHeader icon="card-outline" title="Recebimento automático (Mercado Pago)" />
          <Text style={styles.mpDesc}>Conecte sua conta pra receber o valor das vendas direto e na hora, sem repasse manual.</Text>

          {mp.connected ? (
            <>
              <View style={styles.mpConnectedRow}>
                <View style={styles.mpBadge}>
                  <Ionicons name="checkmark-circle" size={16} color="#059669" />
                  <Text style={styles.mpBadgeText}>Conta conectada</Text>
                </View>
                <TouchableOpacity onPress={disconnectMp}>
                  <Text style={styles.mpDisconnect}>Desconectar</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.mpWarnBox}>
                <Ionicons name="information-circle-outline" size={15} color="#B45309" />
                <Text style={styles.mpWarnText}>
                  Para receber por PIX, sua conta Mercado Pago precisa ter uma chave PIX cadastrada (no app do MP: Seu negócio › PIX).
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.mpWarnBox}>
                <Ionicons name="alert-circle-outline" size={15} color="#B45309" />
                <Text style={styles.mpWarnText}>Sua loja só abre e recebe pedidos após conectar o Mercado Pago. Tenha uma chave PIX cadastrada na conta para receber por PIX.</Text>
              </View>
              <TouchableOpacity style={styles.mpBtn} onPress={connectMp} disabled={mpLoading} activeOpacity={0.85}>
                {mpLoading
                  ? <ActivityIndicator color="#fff" />
                  : <><Ionicons name="open-outline" size={18} color="#fff" /><Text style={styles.mpBtnText}>Conectar Mercado Pago</Text></>}
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={fetchMpStatus} style={styles.mpRefresh}>
            <Ionicons name="refresh" size={13} color={colors.primary} />
            <Text style={styles.mpRefreshText}>Atualizar status</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Horário de funcionamento */}
      <View style={styles.card}>
        <SectionHeader icon="time-outline" title="Horário de funcionamento" />
        <Text style={{ fontSize: 11, color: '#9A8880', marginBottom: 10, marginTop: -4 }}>
          Horário de Vilhena-RO (UTC-4)
        </Text>
        <View style={styles.autoScheduleBox}>
          <Ionicons name="flash" size={14} color="#7C3AED" />
          <Text style={styles.autoScheduleText}>
            A loja abre e fecha <Text style={{ fontWeight: '800' }}>automaticamente</Text> nos horários definidos. O switch manual no início da tela pode ser usado para fechar fora de hora.
          </Text>
        </View>
        {DAYS.map((day, i) => (
          <View key={day} style={[styles.dayRow, i < DAYS.length - 1 && styles.dayRowBorder]}>
            <TouchableOpacity
              style={[styles.dayToggle, schedule[i].open && styles.dayToggleActive]}
              onPress={() => toggleDay(i)}
              activeOpacity={0.8}
            >
              <Text style={[styles.dayLabel, schedule[i].open && styles.dayLabelActive]}>{day}</Text>
            </TouchableOpacity>
            {schedule[i].open ? (
              <View style={styles.dayHours}>
                <TextInput
                  style={[styles.hourInput, schedule[i].from.length === 5 && !validateTime(schedule[i].from) && styles.hourInputError]}
                  value={schedule[i].from}
                  onChangeText={(v) => {
                    const digits = v.replace(/\D/g, '').slice(0, 4)
                    let masked = digits
                    if (digits.length > 2) {
                      const h = parseInt(digits.slice(0, 2), 10)
                      const m = parseInt(digits.slice(2), 10)
                      masked = `${Math.min(h, 23).toString().padStart(2,'0')}:${Math.min(m, 59).toString().padStart(2,'0').slice(0, digits.length - 2)}`
                    }
                    setSchedule((prev) => prev.map((d, idx) => (idx === i ? { ...d, from: masked } : d)))
                  }}
                  onBlur={() => setSchedule((prev) => prev.map((d, idx) => (idx === i ? { ...d, from: normalizeTime(d.from) } : d)))}
                  placeholder="08:00"
                  placeholderTextColor="#C0B0A8"
                  keyboardType="numeric"
                  maxLength={5}
                />
                <Text style={styles.hourSep}>–</Text>
                <TextInput
                  style={[styles.hourInput, schedule[i].to.length === 5 && !validateTime(schedule[i].to) && styles.hourInputError]}
                  value={schedule[i].to}
                  onChangeText={(v) => {
                    const digits = v.replace(/\D/g, '').slice(0, 4)
                    let masked = digits
                    if (digits.length > 2) {
                      const h = parseInt(digits.slice(0, 2), 10)
                      const m = parseInt(digits.slice(2), 10)
                      masked = `${Math.min(h, 23).toString().padStart(2,'0')}:${Math.min(m, 59).toString().padStart(2,'0').slice(0, digits.length - 2)}`
                    }
                    setSchedule((prev) => prev.map((d, idx) => (idx === i ? { ...d, to: masked } : d)))
                  }}
                  onBlur={() => setSchedule((prev) => prev.map((d, idx) => (idx === i ? { ...d, to: normalizeTime(d.to) } : d)))}
                  placeholder="22:00"
                  placeholderTextColor="#C0B0A8"
                  keyboardType="numeric"
                  maxLength={5}
                />
              </View>
            ) : (
              <Text style={styles.dayClosed}>Fechado</Text>
            )}
          </View>
        ))}
      </View>

      {/* Operações */}
      <View style={styles.card}>
        <SectionHeader icon="settings-outline" title="Operações" />
        <View style={field.wrap}>
          <Text style={field.label}>Pedidos simultâneos máximos</Text>
          <TextInput
            style={field.input}
            value={maxConcurrent}
            onChangeText={setMaxConcurrent}
            placeholder="Sem limite"
            placeholderTextColor="#C0B0A8"
            keyboardType="numeric"
          />
          <Text style={{ fontSize: 11, color: '#9A8880', marginTop: 4 }}>
            Bloqueia novos pedidos quando esse número for atingido. Deixe vazio para sem limite.
          </Text>
        </View>

        {/* Exceções de horário */}
        <View style={{ marginTop: 16 }}>
          <Text style={[field.label, { marginBottom: 8 }]}>Feriados / dias fechados</Text>
          {exceptions.map((ex, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 }}>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#1A0A00' }}>
                {ex.date} — {ex.closed ? 'Fechado' : 'Aberto'}
              </Text>
              <TouchableOpacity
                onPress={() => setExceptions(prev => prev.filter((_, idx) => idx !== i))}
                style={{ backgroundColor: '#FEE2E2', borderRadius: 8, padding: 6 }}
              >
                <Ionicons name="trash-outline" size={14} color="#DC2626" />
              </TouchableOpacity>
            </View>
          ))}
          {addingException ? (
            <View style={{ gap: 8 }}>
              <TextInput
                style={field.input}
                value={exceptionDate}
                onChangeText={setExceptionDate}
                placeholder="YYYY-MM-DD (ex: 2025-12-25)"
                placeholderTextColor="#C0B0A8"
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#DC2626', borderRadius: 10, padding: 10, alignItems: 'center' }}
                  onPress={() => {
                    if (exceptionDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                      setExceptions(prev => [...prev, { date: exceptionDate, closed: true }])
                      setExceptionDate('')
                      setAddingException(false)
                    } else {
                      toast('Use o formato YYYY-MM-DD', 'error')
                    }
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Adicionar fechado</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ padding: 10, alignItems: 'center' }}
                  onPress={() => { setAddingException(false); setExceptionDate('') }}
                >
                  <Text style={{ color: '#9A8880', fontWeight: '700' }}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}
              onPress={() => setAddingException(true)}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>Adicionar feriado</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Salvar */}
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
        {saving
          ? <ActivityIndicator color="#fff" />
          : <>
              <Ionicons name="checkmark-outline" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>Salvar alterações</Text>
            </>
        }
      </TouchableOpacity>

      {/* Sair */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={18} color="#DC2626" />
        <Text style={styles.logoutBtnText}>Sair da conta</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Tá Barato · Lojista · v1.0.0</Text>

    </ScrollView>
    </View>
  )
}

const section = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  iconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#FFF0EB',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 15, fontWeight: '800', color: '#1A0A00' },
})

const field = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', color: '#9A8880', marginBottom: 6, letterSpacing: 0.3 },
  input: {
    backgroundColor: '#F5F0EC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1A0A00',
    borderWidth: 1.5,
    borderColor: '#EDE5DF',
  },
  inputMulti: { height: 80, textAlignVertical: 'top', paddingTop: 12 },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  content: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F5' },

  profileCard: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 16,
  },
  profileDecor: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.08)', top: -50, right: -30,
  },
  avatarWrap: { marginBottom: 12, position: 'relative' },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarText: { fontSize: 30, fontWeight: '900', color: '#fff' },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 2, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  profileName: { fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },
  profileNameLight: { fontWeight: '400' },
  profileEmail: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 3, marginBottom: 10 },
  ownerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  ownerBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  twoCol: { flexDirection: 'row', gap: 12 },

  input: {
    borderWidth: 1.5, borderColor: '#EADFD6', backgroundColor: '#FFF',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: '#3A2A1E', marginBottom: 8,
  },
  companyChip: {
    flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#EADFD6', backgroundColor: '#FFF',
  },
  companyChipActive: { borderColor: colors.primary, backgroundColor: '#FFF3EB' },
  companyChipText: { fontSize: 13, fontWeight: '700', color: '#7A5C4A' },
  companyChipTextActive: { color: colors.primary },

  locDesc: { fontSize: 12, color: '#7A5C4A', lineHeight: 18, marginBottom: 12 },
  locBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed',
    borderRadius: 12, padding: 14, backgroundColor: '#FFF3EB',
  },
  locBtnDone: {
    borderColor: '#86EFAC', borderStyle: 'solid', backgroundColor: '#F0FDF4',
  },
  locBtnText: { fontSize: 13, color: colors.primary, fontWeight: '700' },

  infoBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderRadius: 10, padding: 10,
    marginTop: -4,
  },
  infoText: { flex: 1, fontSize: 12, color: '#2563EB', lineHeight: 17 },

  mpDesc: { fontSize: 12.5, color: '#7A5C4A', lineHeight: 18, marginTop: -4, marginBottom: 12 },
  mpWarnBox: {
    flexDirection: 'row', gap: 7, alignItems: 'center',
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A',
    borderRadius: 10, padding: 10, marginBottom: 12,
  },
  mpWarnText: { flex: 1, fontSize: 12, color: '#B45309', fontWeight: '600', lineHeight: 16 },

  mpRequiredBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FEF2F2', borderWidth: 1.5, borderColor: '#FCA5A5',
    borderRadius: 16, padding: 14, marginHorizontal: 16, marginBottom: 12,
  },
  mpRequiredIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#DC2626',
    alignItems: 'center', justifyContent: 'center',
  },
  mpRequiredTitle: { fontSize: 14, fontWeight: '900', color: '#B91C1C' },
  mpRequiredSub: { fontSize: 12, color: '#B91C1C', marginTop: 2, lineHeight: 16 },
  mpBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#009EE3', borderRadius: 12, paddingVertical: 14,
  },
  mpBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  mpConnectedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mpBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0',
    borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
  },
  mpBadgeText: { color: '#059669', fontWeight: '700', fontSize: 13.5 },
  mpDisconnect: { color: '#DC2626', fontWeight: '700', fontSize: 13, padding: 6 },
  mpRefresh: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 12 },
  mpRefreshText: { color: colors.primary, fontSize: 12.5, fontWeight: '700' },

  dayRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10,
  },
  dayRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F5EEE9' },
  dayToggle: {
    width: 46, height: 32, borderRadius: 8,
    backgroundColor: '#F0EBE5',
    alignItems: 'center', justifyContent: 'center',
  },
  dayToggleActive: { backgroundColor: colors.primary },
  dayLabel: { fontSize: 12, fontWeight: '800', color: '#9A8880' },
  dayLabelActive: { color: '#fff' },
  dayHours: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hourInput: {
    width: 64, height: 36, borderRadius: 8,
    backgroundColor: '#F5F0EC',
    borderWidth: 1, borderColor: '#EDE5DF',
    textAlign: 'center',
    fontSize: 14, fontWeight: '700', color: '#1A0A00',
  },
  hourInputError: { borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
  hourSep: { fontSize: 16, color: '#9A8880', fontWeight: '600' },
  dayClosed: { fontSize: 13, color: '#C0B0A8', fontWeight: '600' },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary,
    marginHorizontal: 16, marginBottom: 12,
    paddingVertical: 16,
    borderRadius: 14,
    borderBottomWidth: 3, borderBottomColor: colors.primaryDark,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    minHeight: 56,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5, borderColor: '#FEE2E2',
    backgroundColor: '#FFF5F5',
  },
  logoutBtnText: { color: '#DC2626', fontSize: 15, fontWeight: '700' },

  autoScheduleBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#F5F3FF', borderRadius: 10, padding: 10,
    marginBottom: 12, borderWidth: 1, borderColor: '#DDD6FE',
  },
  autoScheduleText: { flex: 1, fontSize: 12, color: '#5B21B6', lineHeight: 17 },
  version: { textAlign: 'center', color: '#C8B8B0', fontSize: 12, marginTop: 16 },

  photosHint: { fontSize: 12, color: '#9A8880', marginBottom: 12, lineHeight: 17 },

  catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 999, backgroundColor: '#F5F0EC',
    borderWidth: 1.5, borderColor: '#EDE5DF',
  },
  catChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catChipText: { fontSize: 13, fontWeight: '700', color: '#7A5C4A' },
  catChipTextActive: { color: '#fff' },
  photosRow: { gap: 10, paddingBottom: 4 },
  photoThumb: { width: 88, height: 66, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  photoImg: { width: '100%', height: '100%' },
  photoDelete: {
    position: 'absolute', top: 4, right: 4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoAdd: {
    width: 88, height: 66, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#EDE5DF', borderStyle: 'dashed',
    backgroundColor: '#FFF8F4',
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  photoAddText: { fontSize: 10, color: colors.primary, fontWeight: '700' },

  toast: {
    position: 'absolute', top: 0, left: 16, right: 16, zIndex: 99,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#16A34A',
    paddingHorizontal: 18, paddingVertical: 14,
    borderRadius: 14,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 10,
  },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1 },
})
