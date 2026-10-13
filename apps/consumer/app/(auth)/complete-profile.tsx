import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import { api } from '../../src/api/client'
import { useAuthStore } from '../../src/stores/auth.store'
import { colors } from '../../src/theme/colors'
import { formatPhoneBR } from '../../src/utils/phone'
import { useToast } from '../../src/components/Toast'

const STATES = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

// Nome do estado (sem acento, minúsculo) → sigla UF. O reverse geocode do Android
// devolve o nome por extenso ("Rondônia"), então mapeamos pra sigla do nosso seletor.
const STATE_NAME_TO_UF: Record<string, string> = {
  'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA',
  'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO',
  'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
  'para': 'PA', 'paraiba': 'PB', 'parana': 'PR', 'pernambuco': 'PE', 'piaui': 'PI',
  'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
  'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
  'sergipe': 'SE', 'tocantins': 'TO',
}

// Hermes não garante String.normalize — removemos acentos na mão.
function stripAccents(s: string): string {
  return s
    .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
    .replace(/[óòôõö]/g, 'o').replace(/[úùûü]/g, 'u').replace(/ç/g, 'c')
}

function regionToUf(region?: string | null): string | undefined {
  if (!region) return undefined
  const r = region.trim()
  if (r.length === 2 && STATES.includes(r.toUpperCase())) return r.toUpperCase()
  return STATE_NAME_TO_UF[stripAccents(r.toLowerCase())]
}

// Passo pós login social (Google): o Google não fornece cidade/estado, e precisamos
// deles para o cabeçalho/perfil. Tenta detectar pela localização (GPS) e deixa editar.
export default function CompleteProfileScreen() {
  const insets = useSafeAreaInsets()
  const { show: toast } = useToast()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)

  const [city, setCity] = useState(user?.city ?? '')
  const [state, setState] = useState(user?.state ?? 'RO')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [showStates, setShowStates] = useState(false)
  const [loading, setLoading] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [detected, setDetected] = useState(false)

  async function detectLocation(manual: boolean) {
    setDetecting(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        if (manual) {
          toast('Sem a permissão de localização, digite sua cidade manualmente.', 'info')
        }
        return
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const [place] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      })
      if (place) {
        const detectedCity = place.city || place.subregion || ''
        if (detectedCity) setCity(detectedCity)
        const uf = regionToUf(place.region)
        if (uf) setState(uf)
        if (detectedCity) setDetected(true)
      } else if (manual) {
        toast('Não consegui identificar sua cidade. Digite manualmente.', 'error')
      }
    } catch {
      if (manual) toast('Não consegui detectar a localização. Digite sua cidade.', 'error')
    } finally {
      setDetecting(false)
    }
  }

  // Auto-detecta ao abrir (usuário acabou de entrar; é o momento natural de pedir GPS).
  useEffect(() => {
    if (!user?.city) detectLocation(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave() {
    if (!city.trim()) {
      toast('Precisamos da sua cidade para o seu perfil.', 'error')
      return
    }
    setLoading(true)
    try {
      const { data } = await api.patch('/users/me', {
        city: city.trim(),
        state,
        phone: phone.trim() || undefined,
      })
      setUser({ ...(user as any), city: data.city, state: data.state, phone: data.phone })
      router.replace('/(tabs)')
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Não foi possível salvar. Tente de novo.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Header */}
        <LinearGradient
          colors={['#FF3D00', '#FF5500', '#FF7722']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 28 }]}
        >
          <View style={styles.iconBadge}>
            <Ionicons name="location" size={30} color="#fff" />
          </View>
          <Text style={styles.title}>Falta pouco!</Text>
          <Text style={styles.sub}>
            {user?.name ? `Oi, ${user.name.split(' ')[0]}! ` : ''}Só precisamos de onde você está pra deixar tudo certinho.
          </Text>
        </LinearGradient>

        <View style={styles.wave} />

        {/* Form */}
        <View style={styles.form}>

          {/* Botão detectar por GPS */}
          <TouchableOpacity
            style={styles.detectBtn}
            onPress={() => detectLocation(true)}
            disabled={detecting}
            activeOpacity={0.85}
          >
            {detecting ? (
              <>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={styles.detectText}>Detectando sua localização…</Text>
              </>
            ) : (
              <>
                <Ionicons name="navigate" size={17} color={colors.primary} />
                <Text style={styles.detectText}>Usar minha localização</Text>
              </>
            )}
          </TouchableOpacity>

          {detected && (
            <View style={styles.detectedTag}>
              <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
              <Text style={styles.detectedText}>Cidade detectada — confira abaixo</Text>
            </View>
          )}

          <Text style={styles.sectionDesc}>
            Ou preencha manualmente:
          </Text>

          <View style={styles.locationRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Cidade *</Text>
              <View style={styles.inputRow}>
                <Ionicons name="location-outline" size={17} color="#C0B0A8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={city}
                  onChangeText={(v) => { setCity(v); setDetected(false) }}
                  placeholder="Ex: Vilhena"
                  placeholderTextColor="#C8B8B0"
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.stateCol}>
              <Text style={styles.fieldLabel}>Estado *</Text>
              <TouchableOpacity
                style={styles.stateBtn}
                onPress={() => setShowStates(!showStates)}
                activeOpacity={0.8}
              >
                <Text style={styles.stateBtnText}>{state}</Text>
                <Ionicons name={showStates ? 'chevron-up' : 'chevron-down'} size={14} color="#C0B0A8" />
              </TouchableOpacity>
            </View>
          </View>

          {showStates && (
            <View style={styles.stateDropdown}>
              <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {STATES.map((s, i) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.stateOption, i < STATES.length - 1 && styles.stateOptionBorder, s === state && styles.stateOptionActive]}
                    onPress={() => { setState(s); setShowStates(false) }}
                  >
                    <Text style={[styles.stateOptionText, s === state && styles.stateOptionTextActive]}>{s}</Text>
                    {s === state && <Ionicons name="checkmark" size={14} color={colors.primary} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <Text style={[styles.fieldLabel, { marginTop: 6 }]}>Telefone (opcional)</Text>
          <View style={styles.inputRow}>
            <Ionicons name="call-outline" size={17} color="#C0B0A8" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={(v) => setPhone(formatPhoneBR(v))}
              keyboardType="phone-pad"
              maxLength={15}
              placeholder="(69) 99999-9999"
              placeholderTextColor="#C8B8B0"
            />
          </View>
          <Text style={styles.phoneHint}>Ajuda a loja e o entregador a falarem com você.</Text>

          {/* CTA */}
          <TouchableOpacity style={styles.btn} onPress={handleSave} disabled={loading} activeOpacity={0.85}>
            <View style={styles.btnInner}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Text style={styles.btnText}>Continuar</Text>
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                  </>
              }
            </View>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FF7722' },
  scroll: { flexGrow: 1 },

  header: { alignItems: 'center', paddingHorizontal: 28, paddingBottom: 44 },
  iconBadge: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  title: { fontSize: 30, fontWeight: '900', color: '#fff', letterSpacing: -0.5, marginBottom: 8 },
  sub: { fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 20 },

  wave: {
    height: 30,
    backgroundColor: '#FAF6F2',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -14,
  },

  form: {
    backgroundColor: '#FAF6F2',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 48,
    flex: 1,
  },

  detectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF3EB',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  detectText: { color: colors.primary, fontSize: 15, fontWeight: '800' },

  detectedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  detectedText: { color: '#16A34A', fontSize: 12.5, fontWeight: '700' },

  sectionDesc: { fontSize: 13, color: '#9A8880', marginTop: 18, marginBottom: 14, lineHeight: 18 },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#9A8880', marginBottom: 6, letterSpacing: 0.3 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#EDE5DF',
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: '#1A0A00', paddingVertical: 14 },

  locationRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stateCol: { width: 84 },
  stateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#EDE5DF',
    paddingHorizontal: 12,
    height: 52,
  },
  stateBtnText: { fontSize: 15, fontWeight: '700', color: '#1A0A00' },

  stateDropdown: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#EDE5DF',
    marginTop: 8,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  stateOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  stateOptionBorder: { borderBottomWidth: 1, borderBottomColor: '#F5EEE9' },
  stateOptionActive: { backgroundColor: '#FFF3EB' },
  stateOptionText: { fontSize: 14, color: '#1A0A00' },
  stateOptionTextActive: { color: colors.primary, fontWeight: '700' },

  phoneHint: { fontSize: 12, color: '#B0A098', marginTop: 6, marginBottom: 8 },

  btn: {
    marginTop: 24,
    borderRadius: 14,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  btnInner: {
    backgroundColor: colors.primary,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderRadius: 14,
    borderBottomWidth: 3,
    borderBottomColor: colors.primaryDark,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
})
