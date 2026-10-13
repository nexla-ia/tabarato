import { useState, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, Animated, Linking,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import * as Location from 'expo-location'
import { api } from '../../src/api/client'
import { useAuthStore } from '../../src/stores/auth.store'
import { colors } from '../../src/theme/colors'
import { useToast } from '../../src/components/Toast'
import { TERMS_URL, PRIVACY_URL, STORE_TERMS_URL, STORE_TERMS_VERSION } from '../../src/links'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

const STEPS = [
  { label: 'Seus dados',  icon: 'person-outline'     as IoniconName },
  { label: 'Sua loja',    icon: 'storefront-outline'  as IoniconName },
  { label: 'Pagamento',   icon: 'cash-outline'        as IoniconName },
]

function formatCnpj(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`
}

function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
}

function Field({
  label, value, onChangeText, placeholder, icon, keyboardType, secureTextEntry, multiline, right,
}: {
  label: string
  value: string
  onChangeText: (v: string) => void
  placeholder?: string
  icon?: IoniconName
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric'
  secureTextEntry?: boolean
  multiline?: boolean
  right?: React.ReactNode
}) {
  return (
    <View style={field.wrap}>
      <Text style={field.label}>{label}</Text>
      <View style={[field.row, multiline && field.rowMulti]}>
        {icon && <Ionicons name={icon} size={17} color="#C0B0A8" style={field.icon} />}
        <TextInput
          style={[field.input, multiline && field.inputMulti]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#C8B8B0"
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          multiline={multiline}
          numberOfLines={multiline ? 3 : 1}
          textAlignVertical={multiline ? 'top' : 'center'}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        />
        {right}
      </View>
    </View>
  )
}

export default function RegisterStoreScreen() {
  const { show: toast } = useToast()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  // Step 0 — dados pessoais
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Step 1 — dados da loja
  const [storeName, setStoreName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [description, setDescription] = useState('')
  const [storePhone, setStorePhone] = useState('')
  const [address, setAddress] = useState('')

  // Localização
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [locationLabel, setLocationLabel] = useState<string | null>(null)
  const [gettingLocation, setGettingLocation] = useState(false)
  const [validatingStep1, setValidatingStep1] = useState(false)

  // Step 2 — entrega & pagamento
  const [deliveryRadius, setDeliveryRadius] = useState('5')
  const [prepTime, setPrepTime] = useState('30')

  async function handleStep0() {
    if (!name.trim() || !email.trim() || !password) {
      toast('Preencha nome, e-mail e senha.', 'error')
      return
    }
    if (password.length < 6) {
      toast('A senha deve ter ao menos 6 caracteres.', 'error')
      return
    }
    if (password !== confirmPassword) {
      toast('As senhas não coincidem.', 'info')
      return
    }
    setLoading(true)
    try {
      const { data } = await api.post('/auth/register', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone || undefined,
        password,
        role: 'STORE_OWNER',
      })
      await setAuth(data.user, data.accessToken, data.refreshToken)
      setStep(1)
    } catch (err: any) {
      const raw = err.response?.data?.message ?? err.message ?? 'Não foi possível criar a conta.'
      const msg = Array.isArray(raw) ? raw.join('\n') : String(raw)
      toast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleStep1() {
    if (!storeName.trim() || !cnpj || !address.trim()) {
      toast('Preencha nome da loja, CNPJ e endereço.', 'error')
      return
    }
    const digits = cnpj.replace(/\D/g, '')
    if (digits.length !== 14) {
      toast('Digite o CNPJ completo com 14 dígitos.', 'error')
      return
    }
    // Já tem coordenadas (via GPS) → segue direto.
    if (lat !== null) { setStep(2); return }

    // Sem GPS, mas com endereço digitado: converte o endereço em coordenadas
    // (geocoding) pra não travar quem preencheu o endereço. O botão de GPS
    // continua disponível pra quem quiser marcar o ponto exato.
    setValidatingStep1(true)
    try {
      const results = await Location.geocodeAsync(address.trim())
      if (results && results.length > 0) {
        setLat(results[0].latitude)
        setLng(results[0].longitude)
        setLocationLabel(address.trim())
        setValidatingStep1(false)
        setStep(2)
        return
      }
    } catch { /* geocoder pode falhar (sem rede) — cai no alerta abaixo */ }
    setValidatingStep1(false)

    // Não deu pra localizar pelo endereço → oferece GPS ou seguir mesmo assim.
    Alert.alert(
      'Confirmar localização da loja',
      'Não consegui achar seu endereço no mapa. Estando na loja, toque em "Usar GPS" para os entregadores te encontrarem — ou continue e ajuste depois nas configurações da loja.',
      [
        { text: 'Usar GPS', style: 'cancel', onPress: handleGetLocation },
        { text: 'Continuar assim', onPress: () => setStep(2) },
      ],
    )
  }

  async function handleGetLocation() {
    setGettingLocation(true)
    // Zera antes de coletar de novo — deixa claro que é uma leitura NOVA.
    setLat(null); setLng(null); setLocationLabel(null)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        toast('Ative a localização nas configurações do dispositivo.', 'error')
        return
      }
      // A localização do APARELHO precisa estar ligada (não só a permissão do app).
      const servicesOn = await Location.hasServicesEnabledAsync()
      if (!servicesOn) {
        toast('Ative a localização (GPS) do aparelho e tente novamente.', 'info')
        return
      }

      // Balanced usa wifi/rede além do GPS — funciona em tablets sem chip de GPS,
      // onde Accuracy.High (que força o GPS) falharia. Cai pra última posição
      // conhecida se a leitura ao vivo não vier.
      let loc = null
      try {
        loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      } catch {
        loc = await Location.getLastKnownPositionAsync()
      }
      if (!loc) {
        toast('Não conseguimos um sinal de localização agora. Vá para um local mais aberto (perto de uma janela) e tente novamente.', 'error')
        return
      }
      setLat(loc.coords.latitude)
      setLng(loc.coords.longitude)
      // Reverse-geocode para o lojista CONFERIR o endereço (não só ver coordenadas).
      try {
        const places = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude, longitude: loc.coords.longitude,
        })
        const p = places?.[0]
        if (p) {
          const parts = [
            p.street,
            p.name && p.name !== p.street ? p.name : null,
            p.district,
            p.city,
          ].filter(Boolean)
          if (parts.length) {
            const line = parts.join(', ')
            setLocationLabel(line)
            // Autopreenche o "Endereço completo" se estiver vazio (não sobrescreve digitação).
            if (!address.trim()) setAddress(line)
          }
        }
      } catch { /* geocode é opcional; sem ele, mostramos só as coordenadas */ }
    } catch {
      toast('Não foi possível obter a localização. Verifique se o GPS está ativo e tente novamente.', 'error')
    } finally {
      setGettingLocation(false)
    }
  }

  async function handleStep2() {
    if (!acceptedTerms) {
      toast('E preciso aceitar os Termos do Lojista para criar a loja.', 'error')
      return
    }
    setLoading(true)
    try {
      await api.post('/stores', {
        name: storeName.trim(),
        cnpj: cnpj.replace(/\D/g, ''),
        description: description.trim() || undefined,
        phone: storePhone || undefined,
        address: address.trim(),
        lat: lat ?? -12.7410,
        lng: lng ?? -60.1402,
        deliveryRadiusKm: Number(deliveryRadius) || 5,
        prepTimeMin: Number(prepTime) || 30,
        acceptedTerms: true,
        termsVersion: STORE_TERMS_VERSION,
      })
      router.replace('/(store-tabs)')
    } catch (err: any) {
      const raw = err.response?.data?.message ?? err.message ?? 'Não foi possível criar a loja.'
      const msg = Array.isArray(raw) ? raw.join('\n') : String(raw)
      toast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  function goBack() {
    if (step === 0) {
      router.back()
    } else {
      setStep((s) => s - 1)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerDecor} />

        {/* Back + title */}
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backBtn} onPress={goBack} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={styles.logoSmall}>
            <Ionicons name="storefront" size={18} color="#fff" />
          </View>
        </View>

        <Text style={styles.headerTitle}>Cadastro de Lojista</Text>
        <Text style={styles.headerSub}>Vilhena, RO · Tá Barato</Text>

        {/* Step indicator */}
        <View style={styles.steps}>
          {STEPS.map((s, i) => {
            const done = i < step
            const active = i === step
            return (
              <View key={i} style={styles.stepItem}>
                {/* Connector line before */}
                {i > 0 && (
                  <View style={[styles.connector, (done || active) && styles.connectorDone]} />
                )}
                <View style={[styles.stepDot, active && styles.stepDotActive, done && styles.stepDotDone]}>
                  {done
                    ? <Ionicons name="checkmark" size={13} color="#fff" />
                    : <Text style={[styles.stepNum, active && styles.stepNumActive]}>{i + 1}</Text>
                  }
                </View>
                <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{s.label}</Text>
              </View>
            )
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>

          {/* ─── STEP 0: Dados pessoais ─── */}
          {step === 0 && (
            <>
              <View style={styles.stepHeader}>
                <View style={styles.stepIconWrap}>
                  <Ionicons name="person-outline" size={20} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.stepTitle}>Seus dados pessoais</Text>
                  <Text style={styles.stepDesc}>Informações da sua conta de acesso</Text>
                </View>
              </View>

              <Field
                label="Nome completo"
                value={name}
                onChangeText={setName}
                placeholder="Seu nome completo"
                icon="person-outline"
              />
              <Field
                label="E-mail"
                value={email}
                onChangeText={setEmail}
                placeholder="seu@email.com"
                icon="mail-outline"
                keyboardType="email-address"
              />
              <Field
                label="Telefone pessoal"
                value={phone}
                onChangeText={(v) => setPhone(formatPhone(v))}
                placeholder="(69) 99999-0000"
                icon="call-outline"
                keyboardType="phone-pad"
              />
              <Field
                label="Senha"
                value={password}
                onChangeText={setPassword}
                placeholder="Mínimo 6 caracteres"
                icon="lock-closed-outline"
                secureTextEntry={!showPassword}
                right={
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={field.eye}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#C0B0A8" />
                  </TouchableOpacity>
                }
              />
              <Field
                label="Confirmar senha"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repita a senha"
                icon="lock-closed-outline"
                secureTextEntry={!showConfirm}
                right={
                  <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={field.eye}>
                    <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={18} color="#C0B0A8" />
                  </TouchableOpacity>
                }
              />

              <TouchableOpacity style={styles.cta} onPress={handleStep0} disabled={loading} activeOpacity={0.85}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Text style={styles.ctaText}>Continuar</Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </>
                }
              </TouchableOpacity>
            </>
          )}

          {/* ─── STEP 1: Dados da loja ─── */}
          {step === 1 && (
            <>
              <View style={styles.stepHeader}>
                <View style={styles.stepIconWrap}>
                  <Ionicons name="storefront-outline" size={20} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.stepTitle}>Dados da sua loja</Text>
                  <Text style={styles.stepDesc}>Como os clientes vão te encontrar</Text>
                </View>
              </View>

              <Field
                label="Nome da loja *"
                value={storeName}
                onChangeText={setStoreName}
                placeholder="Ex: Burguer do Zé"
                icon="storefront-outline"
              />
              <Field
                label="CNPJ *"
                value={cnpj}
                onChangeText={(v) => setCnpj(formatCnpj(v))}
                placeholder="00.000.000/0000-00"
                icon="document-text-outline"
                keyboardType="numeric"
              />
              <Field
                label="Descrição da loja"
                value={description}
                onChangeText={setDescription}
                placeholder="Conte um pouco sobre seu estabelecimento..."
                icon="chatbubble-outline"
                multiline
              />
              <Field
                label="Telefone da loja"
                value={storePhone}
                onChangeText={(v) => setStorePhone(formatPhone(v))}
                placeholder="(69) 99999-0000"
                icon="call-outline"
                keyboardType="phone-pad"
              />
              <Field
                label="Endereço completo *"
                value={address}
                onChangeText={setAddress}
                placeholder="Rua, número, bairro — Vilhena, RO"
                icon="location-outline"
              />

              {/* Location picker */}
              {lat !== null ? (
                <View style={styles.locationSuccess}>
                  <Ionicons name="checkmark-circle" size={18} color="#059669" style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.locationSuccessText}>
                      {locationLabel ?? 'Localização obtida'}
                    </Text>
                    <Text style={styles.locationCoords}>
                      {gettingLocation ? 'Atualizando…' : `Coordenadas: ${lat.toFixed(5)}, ${lng!.toFixed(5)}`}
                    </Text>
                    <Text style={styles.locationHint}>Confira se corresponde ao endereço da sua loja.</Text>
                  </View>
                  <TouchableOpacity onPress={handleGetLocation} disabled={gettingLocation}>
                    <Text style={styles.locationRetry}>Atualizar</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.locationBtn}
                  onPress={handleGetLocation}
                  disabled={gettingLocation}
                  activeOpacity={0.85}
                >
                  {gettingLocation ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="locate-outline" size={17} color={colors.primary} />
                      <Text style={styles.locationBtnText}>Usar localização atual (estou na loja)</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.cta} onPress={handleStep1} disabled={validatingStep1} activeOpacity={0.85}>
                {validatingStep1
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Text style={styles.ctaText}>Continuar</Text>
                      <Ionicons name="arrow-forward" size={18} color="#fff" />
                    </>
                }
              </TouchableOpacity>
            </>
          )}

          {/* ─── STEP 2: Entrega & Pagamento ─── */}
          {step === 2 && (
            <>
              <View style={styles.stepHeader}>
                <View style={styles.stepIconWrap}>
                  <Ionicons name="cash-outline" size={20} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.stepTitle}>Entrega & Pagamento</Text>
                  <Text style={styles.stepDesc}>Configure como você entrega e recebe</Text>
                </View>
              </View>

              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Raio de entrega (km)"
                    value={deliveryRadius}
                    onChangeText={setDeliveryRadius}
                    placeholder="5"
                    icon="bicycle-outline"
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Preparo (min)"
                    value={prepTime}
                    onChangeText={setPrepTime}
                    placeholder="30"
                    icon="time-outline"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.infoBox}>
                <Ionicons name="shield-checkmark-outline" size={15} color="#059669" />
                <Text style={[styles.infoText, { color: '#059669' }]}>
                  Depois da aprovação, você cadastra sua chave PIX. O valor de cada venda entra na sua carteira quando o pedido é concluído, e você saca quando quiser.
                </Text>
              </View>

              <View style={styles.summaryBox}>
                <Text style={styles.summaryTitle}>Resumo do cadastro</Text>
                <SummaryRow icon="person-outline" label="Responsável" value={name} />
                <SummaryRow icon="mail-outline" label="E-mail" value={email} />
                <SummaryRow icon="storefront-outline" label="Loja" value={storeName} />
                <SummaryRow icon="location-outline" label="Endereço" value={address} />
              </View>

              <TouchableOpacity
                style={styles.termsRow}
                onPress={() => setAcceptedTerms((v) => !v)}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acceptedTerms }}
              >
                <View style={[styles.termsBox, acceptedTerms && styles.termsBoxOn]}>
                  {acceptedTerms && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={styles.termsText}>
                  Li e aceito os{' '}
                  <Text style={styles.legalLink} onPress={() => Linking.openURL(STORE_TERMS_URL).catch(() => {})}>
                    Termos do Lojista
                  </Text>
                  {' '}— inclusive a comissão da plataforma sobre cada venda — os{' '}
                  <Text style={styles.legalLink} onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}>
                    Termos de Uso
                  </Text>
                  {' '}e a{' '}
                  <Text style={styles.legalLink} onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}>
                    Política de Privacidade
                  </Text>
                  .
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.cta, !acceptedTerms && styles.ctaOff]}
                onPress={handleStep2}
                disabled={loading || !acceptedTerms}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={styles.ctaText}>Criar minha loja</Text>
                    </>
                }
              </TouchableOpacity>
            </>
          )}

          {/* Login link */}
          <TouchableOpacity style={styles.loginLink} onPress={() => router.replace('/(auth)/login')} activeOpacity={0.8}>
            <Text style={styles.loginLinkText}>Já tem uma conta? </Text>
            <Text style={[styles.loginLinkText, { color: colors.primary, fontWeight: '800' }]}>Entrar</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function SummaryRow({ icon, label, value }: { icon: IoniconName; label: string; value: string }) {
  if (!value) return null
  return (
    <View style={summary.row}>
      <Ionicons name={icon} size={13} color="#9A8880" />
      <Text style={summary.label}>{label}</Text>
      <Text style={summary.value} numberOfLines={1}>{value}</Text>
    </View>
  )
}

const summary = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  label: { fontSize: 12, color: '#9A8880', fontWeight: '600', width: 80 },
  value: { flex: 1, fontSize: 12, color: '#1A0A00', fontWeight: '700' },
})

const field = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', color: '#9A8880', marginBottom: 6, letterSpacing: 0.3 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F0EC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#EDE5DF',
    paddingHorizontal: 14,
    minHeight: 52,
  },
  rowMulti: { alignItems: 'flex-start', paddingTop: 14, minHeight: 90 },
  icon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: '#1A0A00', paddingVertical: 14 },
  inputMulti: { paddingVertical: 0, flex: 1 },
  eye: { paddingLeft: 8 },
})

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },

  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 28,
    position: 'relative',
    overflow: 'hidden',
  },
  headerDecor: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -80, right: -70,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  logoSmall: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -0.4 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2, marginBottom: 24 },

  steps: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
    position: 'relative',
  },
  connector: {
    position: 'absolute',
    top: 14,
    right: '50%',
    left: -50,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    zIndex: 0,
  },
  connectorDone: { backgroundColor: 'rgba(255,255,255,0.8)' },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 1,
  },
  stepDotActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  stepDotDone: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  stepNum: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.6)' },
  stepNumActive: { color: colors.primary },
  stepLabel: { fontSize: 10, color: 'rgba(255,255,255,0.55)', fontWeight: '700', marginTop: 5, textAlign: 'center' },
  stepLabelActive: { color: '#fff' },

  scroll: { flexGrow: 1 },

  card: {
    backgroundColor: '#FAF6F2',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 48,
    flex: 1,
    minHeight: '100%',
  },

  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  stepIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#FFF0EB',
    alignItems: 'center', justifyContent: 'center',
  },
  stepTitle: { fontSize: 18, fontWeight: '900', color: '#1A0A00', letterSpacing: -0.2 },
  stepDesc: { fontSize: 13, color: '#9A8880', marginTop: 1 },

  twoCol: { flexDirection: 'row', gap: 12 },

  infoBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderRadius: 10, padding: 12,
    marginBottom: 20, marginTop: -4,
  },
  infoText: { flex: 1, fontSize: 12, color: '#2563EB', lineHeight: 17 },

  locationBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: colors.primary,
    borderStyle: 'dashed', borderRadius: 12,
    padding: 14, marginBottom: 20, marginTop: -4,
    backgroundColor: '#FFF3EB',
  },
  locationBtnText: { flex: 1, fontSize: 13, color: colors.primary, fontWeight: '700' },
  locationSuccess: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#DCFCE7', borderRadius: 12,
    padding: 12, marginBottom: 20, marginTop: -4,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  locationSuccessText: { fontSize: 13, color: '#15803D', fontWeight: '700', lineHeight: 18 },
  locationCoords: { fontSize: 11, color: '#3F9668', fontWeight: '500', marginTop: 2 },
  locationHint: { fontSize: 11, color: '#3F9668', marginTop: 3, fontStyle: 'italic' },
  locationRetry: { fontSize: 12, color: colors.primary, fontWeight: '700', marginTop: 1 },

  summaryBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#EDE5DF',
  },
  summaryTitle: { fontSize: 12, fontWeight: '800', color: '#9A8880', marginBottom: 10, letterSpacing: 0.5 },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 17,
    borderRadius: 14,
    borderBottomWidth: 3,
    borderBottomColor: colors.primaryDark,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    marginBottom: 20,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  legal: { fontSize: 12, color: '#9A8880', lineHeight: 17, textAlign: 'center', marginBottom: 14 },
  // Aceite dos Termos do Lojista: checkbox de verdade, porque é o ato que registra
  // a concordância com a comissão — e o servidor grava data e versão.
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14, paddingRight: 4 },
  termsBox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#D9C9BF',
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  termsBoxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  termsText: { flex: 1, fontSize: 12, color: '#7A5C4A', lineHeight: 17 },
  ctaOff: { opacity: 0.5 },
  legalLink: { color: colors.primary, fontWeight: '700' },

  loginLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  loginLinkText: { fontSize: 14, color: '#9A8880' },
})
