import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, Linking,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { api } from '../../src/api/client'
import { useAuthStore } from '../../src/stores/auth.store'
import { colors } from '../../src/theme/colors'
import { formatPhoneBR } from '../../src/utils/phone'
import { useToast } from '../../src/components/Toast'
import { TERMS_URL, PRIVACY_URL } from '../../src/links'
import { BibleOfferModal } from '../../src/components/BibleOfferModal'

type RegisterRole = 'CONSUMER' | 'COURIER'

const STATES = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

function Field({
  label,
  icon,
  children,
}: {
  label: string
  icon: IoniconName
  children: React.ReactNode
}) {
  return (
    <View style={field.wrap}>
      <Text style={field.label}>{label}</Text>
      <View style={field.inputRow}>
        <Ionicons name={icon} size={17} color="#C0B0A8" style={field.icon} />
        {children}
      </View>
    </View>
  )
}

const field = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', color: '#9A8880', marginBottom: 6, letterSpacing: 0.3 },
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
  icon: { marginRight: 10 },
})

export default function RegisterScreen() {
  const { show: toast } = useToast()
  const params = useLocalSearchParams<{ role?: string; ref?: string }>()
  const [role, setRole] = useState<RegisterRole>(params.role === 'courier' ? 'COURIER' : 'CONSUMER')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('RO')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showStates, setShowStates] = useState(false)
  const [loading, setLoading] = useState(false)
  const [referralCode, setReferralCode] = useState(params.ref ?? '')
  const setAuth = useAuthStore((s) => s.setAuth)
  // Oferta da Bíblia de cortesia: aparece depois da conta criada, antes de entrar
  // no app. Só para cliente — entregador segue direto pro painel dele.
  const [bibleOpen, setBibleOpen] = useState(false)
  const [bibleSaving, setBibleSaving] = useState(false)

  async function handleRegister() {
    if (!name.trim() || !email.trim() || !password) {
      toast('Preencha nome, e-mail e senha.', 'error')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast('Digite um endereço de e-mail válido (ex: seu@email.com)', 'error')
      return
    }
    if (password.length < 6) {
      toast('A senha deve ter pelo menos 6 caracteres.', 'error')
      return
    }
    if (!city.trim()) {
      toast('Precisamos da sua cidade para mostrar lojas perto de você.', 'error')
      return
    }
    setLoading(true)
    try {
      const { data } = await api.post('/auth/register', {
        name, email, phone, password, city, state, role,
        referralCode: referralCode.trim().toUpperCase() || undefined,
      })
      await setAuth(data.user, data.accessToken, data.refreshToken)
      if (role === 'COURIER') {
        router.replace('/(courier-tabs)')
      } else {
        setBibleOpen(true)
      }
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Não foi possível criar a conta', 'error')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Resposta da cortesia. Entrar no app não pode depender disso: se a chamada
   * falhar, segue mesmo assim — a oferta reaparece no próximo acesso, que é bem
   * menos grave do que prender a pessoa num modal depois de criar a conta.
   */
  async function answerBible(accepted: boolean) {
    setBibleSaving(true)
    try {
      await api.post('/users/me/bible-offer', { accepted })
    } catch {
      // silencioso de propósito — ver comentário acima
    } finally {
      setBibleSaving(false)
      setBibleOpen(false)
      router.replace('/(tabs)')
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <BibleOfferModal visible={bibleOpen} saving={bibleSaving} onAnswer={answerBible} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={18} color="rgba(255,255,255,0.8)" />
            <Text style={styles.backText}>Voltar</Text>
          </TouchableOpacity>

          <View style={styles.brandMark}>
            <Text style={styles.brandEmoji}>🛒</Text>
          </View>
          <Text style={styles.title}>Criar conta</Text>
          <Text style={styles.sub}>Escolha seu tipo e comece agora</Text>
        </View>

        <View style={styles.wave} />

        {/* Form */}
        <View style={styles.form}>

          {/* Role selector */}
          <Text style={styles.section}>Tipo de conta</Text>
          <View style={styles.roleRow}>
            <TouchableOpacity
              style={[styles.roleCard, role === 'CONSUMER' && styles.roleCardActive]}
              onPress={() => setRole('CONSUMER')}
              activeOpacity={0.8}
            >
              <View style={[styles.roleIcon, role === 'CONSUMER' && styles.roleIconActive]}>
                <Ionicons name="person-outline" size={22} color={role === 'CONSUMER' ? '#fff' : '#9A8880'} />
              </View>
              <Text style={[styles.roleLabel, role === 'CONSUMER' && styles.roleLabelActive]}>Cliente</Text>
              <Text style={styles.roleSub}>Compras e pedidos</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.roleCard, role === 'COURIER' && styles.roleCardActive]}
              onPress={() => setRole('COURIER')}
              activeOpacity={0.8}
            >
              <View style={[styles.roleIcon, role === 'COURIER' && styles.roleIconActiveCourier]}>
                <Ionicons name="bicycle-outline" size={22} color={role === 'COURIER' ? '#fff' : '#9A8880'} />
              </View>
              <Text style={[styles.roleLabel, role === 'COURIER' && styles.roleLabelCourier]}>Entregador</Text>
              <Text style={styles.roleSub}>Faça entregas</Text>
            </TouchableOpacity>

            {/* Lojista tem fluxo próprio (wizard 3 passos com dados da loja) */}
            <TouchableOpacity
              style={styles.roleCard}
              onPress={() => router.push('/(auth)/register-store')}
              activeOpacity={0.8}
            >
              <View style={styles.roleIcon}>
                <Ionicons name="storefront-outline" size={22} color="#9A8880" />
              </View>
              <Text style={styles.roleLabel}>Lojista</Text>
              <Text style={styles.roleSub}>Vender produtos</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.section}>Dados pessoais</Text>

          <Field label="Nome completo" icon="person-outline">
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Seu nome"
              placeholderTextColor="#C8B8B0"
            />
          </Field>

          <Field label="E-mail" icon="mail-outline">
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="seu@email.com"
              placeholderTextColor="#C8B8B0"
            />
          </Field>

          <Field label="Telefone" icon="call-outline">
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={(v) => setPhone(formatPhoneBR(v))}
              keyboardType="phone-pad"
              maxLength={15}
              placeholder="(69) 99999-9999"
              placeholderTextColor="#C8B8B0"
            />
          </Field>

          <Field label="Senha" icon="lock-closed-outline">
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor="#C8B8B0"
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#C0B0A8" />
            </TouchableOpacity>
          </Field>

          {/* Localização */}
          <View style={styles.sectionRow}>
            <View style={styles.sectionDivider} />
            <Text style={styles.section}>Localização</Text>
            <View style={styles.sectionDivider} />
          </View>
          <Text style={styles.sectionDesc}>
            Usamos sua cidade para mostrar lojas próximas a você
          </Text>

          <View style={styles.locationRow}>
            <View style={{ flex: 1 }}>
              <Field label="Cidade" icon="location-outline">
                <TextInput
                  style={styles.input}
                  value={city}
                  onChangeText={setCity}
                  placeholder="Ex: Vilhena"
                  placeholderTextColor="#C8B8B0"
                  autoCapitalize="words"
                />
              </Field>
            </View>

            <View style={styles.stateCol}>
              <Text style={field.label}>Estado</Text>
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

          {/* CTA */}
          <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading} activeOpacity={0.85}>
            <View style={styles.btnInner}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Text style={styles.btnText}>Criar conta grátis</Text>
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                  </>
              }
            </View>
          </TouchableOpacity>

          <Text style={styles.terms}>
            Ao continuar, você concorda com os{' '}
            <Text style={styles.termsLink} onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}>
              Termos de Uso
            </Text>
            {' '}e com a{' '}
            <Text style={styles.termsLink} onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}>
              Política de Privacidade
            </Text>
            .
          </Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  scroll: { flexGrow: 1 },

  header: {
    paddingTop: 56,
    paddingHorizontal: 28,
    paddingBottom: 40,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 },
  backText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600' },
  brandMark: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  brandEmoji: { fontSize: 26 },
  title: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: -0.5, marginBottom: 4 },
  sub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', fontStyle: 'italic' },

  wave: {
    height: 30,
    backgroundColor: '#FAF6F2',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },

  form: {
    backgroundColor: '#FAF6F2',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 48,
  },

  section: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 16,
    marginTop: 20,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
    marginBottom: 8,
  },
  sectionDivider: { flex: 1, height: 1, backgroundColor: '#EDE5DF' },
  sectionDesc: {
    fontSize: 12,
    color: '#9A8880',
    marginBottom: 16,
    lineHeight: 17,
  },

  input: {
    flex: 1,
    fontSize: 15,
    color: '#1A0A00',
    paddingVertical: 14,
  },
  eyeBtn: { paddingLeft: 8 },

  locationRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stateCol: { width: 74, marginBottom: 14 },
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
    marginTop: 0,
  },
  stateBtnText: { fontSize: 15, fontWeight: '700', color: '#1A0A00' },

  stateDropdown: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#EDE5DF',
    marginBottom: 14,
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

  btn: {
    marginTop: 12,
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

  terms: { textAlign: 'center', color: '#B0A098', fontSize: 12, marginTop: 18, lineHeight: 18 },
  termsLink: { color: colors.primary, fontWeight: '700' },

  roleRow: { flexDirection: 'row', gap: 9, marginBottom: 8 },
  roleCard: {
    flex: 1, alignItems: 'center', paddingVertical: 15, paddingHorizontal: 5,
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 2, borderColor: '#EDE5DF',
    gap: 6,
  },
  roleCardActive: { borderColor: colors.primary, backgroundColor: '#FFF3EB' },
  roleIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#F0E8E2', alignItems: 'center', justifyContent: 'center',
  },
  roleIconActive: { backgroundColor: colors.primary },
  roleIconActiveCourier: { backgroundColor: '#0284C7' },
  roleLabel: { fontSize: 14, fontWeight: '800', color: '#9A8880', textAlign: 'center' },
  roleLabelActive: { color: colors.primary },
  roleLabelCourier: { color: '#0284C7' },
  roleSub: { fontSize: 10.5, color: '#B0A098', fontWeight: '500', textAlign: 'center' },
})
