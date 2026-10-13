import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { Link, router, useNavigation } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin'
import { api } from '../../src/api/client'
import { useAuthStore } from '../../src/stores/auth.store'
import { colors } from '../../src/theme/colors'
import { useToast } from '../../src/components/Toast'

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID

type ProfileMode = 'consumer' | 'store' | 'courier'

export default function LoginScreen() {
  const insets = useSafeAreaInsets()
  const { show: toast } = useToast()
  const navigation = useNavigation()
  const canGoBack = navigation.canGoBack()
  const [mode, setMode] = useState<ProfileMode>('consumer')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const setAuth = useAuthStore((s) => s.setAuth)

  useEffect(() => {
    if (GOOGLE_WEB_CLIENT_ID) {
      GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID })
    }
  }, [])

  async function handleGoogle() {
    if (!GOOGLE_WEB_CLIENT_ID) {
      toast('Login com Google não está configurado neste app.', 'error')
      return
    }
    setGoogleLoading(true)
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
      const result: any = await GoogleSignin.signIn()
      if (result?.type === 'cancelled') return
      const idToken = result?.data?.idToken ?? result?.idToken
      if (!idToken) throw new Error('Sem token do Google')

      const { data } = await api.post('/auth/google', { idToken })
      await setAuth(data.user, data.accessToken, data.refreshToken)
      // Se o e-mail já for de uma conta lojista/entregador, vai pro painel certo.
      if (data.user.role === 'STORE_OWNER') {
        router.replace('/(store-tabs)')
      } else if (data.user.role === 'COURIER') {
        router.replace('/(courier-tabs)')
      } else if (!data.user.city) {
        // Cliente novo via Google: Google não fornece cidade/estado (obrigatórios
        // p/ mostrar lojas próximas). Coleta antes de entrar.
        router.replace('/(auth)/complete-profile')
      } else {
        router.replace('/(tabs)')
      }
    } catch (err: any) {
      if (err?.code === statusCodes.SIGN_IN_CANCELLED || err?.code === statusCodes.IN_PROGRESS) return
      toast(err.response?.data?.message ?? 'Não foi possível entrar com o Google.', 'error')
    } finally {
      setGoogleLoading(false)
    }
  }

  async function handleLogin() {
    if (!email || !password) {
      toast('Preencha todos os campos', 'error')
      return
    }
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      await setAuth(data.user, data.accessToken, data.refreshToken)

      if (data.user.role === 'STORE_OWNER') {
        router.replace('/(store-tabs)')
      } else if (data.user.role === 'COURIER') {
        router.replace('/(courier-tabs)')
      } else {
        router.replace('/(tabs)')
      }
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'E-mail ou senha incorretos', 'error')
    } finally {
      setLoading(false)
    }
  }

  const isStore = mode === 'store'
  const isCourier = mode === 'courier'

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Header */}
        <LinearGradient
          colors={['#FF3D00', '#FF5500', '#FF7722']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 20 }]}
        >
          {canGoBack && (
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
          )}
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logoImg}
            resizeMode="contain"
          />
          {(isStore || isCourier) && (
            <Text style={styles.slogan}>
              {isStore ? 'Painel do Lojista' : 'Área do Entregador'}
            </Text>
          )}
        </LinearGradient>

        <View style={styles.wave} />

        {/* Form */}
        <View style={styles.form}>

          {/* Seletor de perfil */}
          <View style={styles.modeSelector}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'consumer' && styles.modeBtnActive]}
              onPress={() => setMode('consumer')}
              activeOpacity={0.8}
            >
              <Ionicons name="person-outline" size={15} color={mode === 'consumer' ? colors.primary : '#9A8880'} />
              <Text style={[styles.modeBtnText, mode === 'consumer' && styles.modeBtnTextActive]}>Cliente</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'store' && styles.modeBtnActive]}
              onPress={() => setMode('store')}
              activeOpacity={0.8}
            >
              <Ionicons name="storefront-outline" size={15} color={mode === 'store' ? colors.primary : '#9A8880'} />
              <Text style={[styles.modeBtnText, mode === 'store' && styles.modeBtnTextActive]}>Lojista</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'courier' && styles.modeBtnActive]}
              onPress={() => setMode('courier')}
              activeOpacity={0.8}
            >
              <Ionicons name="bicycle-outline" size={15} color={mode === 'courier' ? colors.primary : '#9A8880'} />
              <Text style={[styles.modeBtnText, mode === 'courier' && styles.modeBtnTextActive]}>Entregador</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.formTitle}>
            {isStore ? 'Acesso ao painel' : isCourier ? 'Área do entregador' : 'Bem-vindo de volta'}
          </Text>
          <Text style={styles.formSub}>
            {isStore
              ? 'Gerencie seus pedidos e produtos'
              : isCourier
              ? 'Entre para ver suas entregas'
              : 'Entre para continuar comprando'}
          </Text>

          {/* Email */}
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>E-mail</Text>
            <View style={styles.inputRow}>
              <Ionicons name="mail-outline" size={17} color="#C0B0A8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="seu@email.com"
                placeholderTextColor="#C8B8B0"
              />
            </View>
          </View>

          {/* Senha */}
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Senha</Text>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={17} color="#C0B0A8" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="Sua senha"
                placeholderTextColor="#C8B8B0"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#C0B0A8" />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.forgotBtn} onPress={() => router.push('/(auth)/forgot-password' as any)}>
            <Text style={styles.forgotText}>Esqueceu a senha?</Text>
          </TouchableOpacity>

          {/* CTA */}
          <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
            <View style={styles.btnInner}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Text style={styles.btnText}>Entrar</Text>
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                  </>
              }
            </View>
          </TouchableOpacity>

          {/* Login social — Google (só cliente) */}
          {mode === 'consumer' && GOOGLE_WEB_CLIENT_ID && (
            <>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>ou continue com</Text>
                <View style={styles.dividerLine} />
              </View>
              <TouchableOpacity
                style={styles.googleBtn}
                onPress={handleGoogle}
                disabled={googleLoading}
                activeOpacity={0.85}
              >
                {googleLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={19} color="#EA4335" />
                    <Text style={styles.googleText}>Continuar com Google</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Register */}
          <Link
            href={isStore ? '/(auth)/register-store' : isCourier ? { pathname: '/(auth)/register', params: { role: 'courier' } } : '/(auth)/register'}
            asChild
          >
            <TouchableOpacity style={styles.registerBtn} activeOpacity={0.8}>
              <Text style={styles.registerText}>
                {isStore ? 'Cadastrar minha loja' : isCourier ? 'Cadastrar como entregador' : 'Criar uma conta grátis'}
              </Text>
              <Ionicons name="chevron-forward" size={15} color={colors.primary} />
            </TouchableOpacity>
          </Link>

        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FF7722' },
  scroll: { flexGrow: 1 },

  header: {
    alignItems: 'center',
    paddingTop: 72,
    paddingBottom: 48,
  },
  backBtn: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  logoImg: {
    width: 200,
    height: 200,
    marginBottom: -40,
  },
  brand: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1,
    textShadowColor: colors.primaryDark,
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0,
  },
  slogan: { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4, fontStyle: 'italic' },

  wave: {
    height: 30,
    backgroundColor: '#FAF6F2',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },

  form: {
    backgroundColor: '#FAF6F2',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 48,
    flex: 1,
  },

  modeSelector: {
    flexDirection: 'row',
    backgroundColor: '#F0E8E2',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
  },
  modeBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  modeBtnText: { fontSize: 12, fontWeight: '700', color: '#9A8880' },
  modeBtnTextActive: { color: colors.primary },

  formTitle: { fontSize: 24, fontWeight: '900', color: '#1A0A00', letterSpacing: -0.3, marginBottom: 4 },
  formSub: { fontSize: 14, color: '#9A8880', marginBottom: 28 },

  fieldWrap: { marginBottom: 14 },
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
  eyeBtn: { paddingLeft: 8 },

  forgotBtn: { alignSelf: 'flex-end', marginBottom: 20, marginTop: -4 },
  forgotText: { fontSize: 13, color: colors.primary, fontWeight: '600' },

  btn: {
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

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 24, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#EDE5DF' },
  dividerText: { color: '#B0A098', fontSize: 13 },

  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#fff',
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#EDE5DF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  googleText: { color: '#3C2A22', fontSize: 15, fontWeight: '700' },

  registerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  registerText: { color: colors.primary, fontWeight: '800', fontSize: 15 },
})
