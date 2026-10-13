import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../../src/api/client'
import { colors } from '../../src/theme/colors'
import { useToast } from '../../src/components/Toast'

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets()
  const { show: toast } = useToast()
  // Passo 1: pedir o código. Passo 2: digitar código + nova senha.
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  async function requestCode() {
    const mail = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(mail)) {
      toast('Digite um e-mail válido.', 'error')
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email: mail })
      // A resposta é sempre a mesma (o servidor não conta se a conta existe).
      toast('Se houver conta com esse e-mail, enviamos um código.', 'success')
      setStep(2)
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Não foi possível enviar agora. Tente de novo.', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function submitNewPassword() {
    if (code.length !== 6) {
      toast('O código tem 6 dígitos.', 'error')
      return
    }
    if (password.length < 6) {
      toast('A nova senha precisa de ao menos 6 caracteres.', 'error')
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/reset-password', {
        email: email.trim().toLowerCase(),
        code,
        newPassword: password,
      })
      toast('Senha alterada! Entre com a nova senha.', 'success')
      router.replace('/(auth)/login')
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Código inválido ou expirado. Peça um novo.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.header, { paddingTop: insets.top + 24 }]}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => (step === 2 ? setStep(1) : router.back())}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={styles.lockWrap}>
            <Ionicons name="lock-open-outline" size={30} color="#fff" />
          </View>
        </View>

        <View style={[styles.card, { paddingBottom: insets.bottom + 28 }]}>
          {step === 1 ? (
            <>
              <Text style={styles.formTitle}>Recuperar senha</Text>
              <Text style={styles.formSub}>
                Informe o e-mail da sua conta. Vamos mandar um código de 6 dígitos.
              </Text>

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>E-MAIL</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="mail-outline" size={18} color="#B0A098" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="voce@email.com"
                    placeholderTextColor="#C0B0A8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.btn} onPress={requestCode} disabled={loading} activeOpacity={0.85}>
                <View style={styles.btnInner}>
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <><Text style={styles.btnText}>Enviar código</Text><Ionicons name="arrow-forward" size={18} color="#fff" /></>}
                </View>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.formTitle}>Digite o código</Text>
              <Text style={styles.formSub}>
                Enviamos um código de 6 dígitos para{' '}
                <Text style={styles.mail}>{email.trim().toLowerCase()}</Text>. Ele vale por 15 minutos.
              </Text>

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>CÓDIGO</Text>
                <TextInput
                  style={styles.codeInput}
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  placeholderTextColor="#D8C8C0"
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!loading}
                  autoFocus
                />
              </View>

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>NOVA SENHA</Text>
                <View style={styles.inputRow}>
                  <Ionicons name="lock-closed-outline" size={18} color="#B0A098" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Ao menos 6 caracteres"
                    placeholderTextColor="#C0B0A8"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!loading}
                  />
                  <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword((v) => !v)}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={19} color="#B0A098" />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity style={styles.btn} onPress={submitNewPassword} disabled={loading} activeOpacity={0.85}>
                <View style={styles.btnInner}>
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={styles.btnText}>Salvar nova senha</Text></>}
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.resend} onPress={requestCode} disabled={loading}>
                <Text style={styles.resendText}>Não chegou? Enviar outro código</Text>
              </TouchableOpacity>
            </>
          )}

          <Text style={styles.hint}>
            O código chega por e-mail. Confira também a caixa de spam.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FF7722' },
  scroll: { flexGrow: 1 },

  header: { alignItems: 'center', paddingBottom: 40 },
  backBtn: {
    position: 'absolute', top: 16, left: 16, width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  lockWrap: {
    width: 68, height: 68, borderRadius: 22, marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },

  card: {
    flex: 1, backgroundColor: '#FFFBF7',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 30,
  },
  formTitle: { fontSize: 24, fontWeight: '900', color: '#1A0A00', letterSpacing: -0.3, marginBottom: 4 },
  formSub: { fontSize: 14, color: '#9A8880', marginBottom: 28, lineHeight: 20 },
  mail: { color: '#1A0A00', fontWeight: '700' },

  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#9A8880', marginBottom: 6, letterSpacing: 0.3 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, borderWidth: 1.5, borderColor: '#EDE5DF',
    paddingHorizontal: 14, minHeight: 52,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: '#1A0A00', paddingVertical: 14 },
  eyeBtn: { paddingLeft: 8 },

  codeInput: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#EDE5DF',
    paddingVertical: 14, fontSize: 30, fontWeight: '800', letterSpacing: 12,
    textAlign: 'center', color: '#1A0A00',
  },

  btn: {
    borderRadius: 14, marginTop: 10,
    shadowColor: colors.primaryDark, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  btnInner: {
    backgroundColor: colors.primary, paddingVertical: 17,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
    borderRadius: 14, borderBottomWidth: 3, borderBottomColor: colors.primaryDark,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },

  resend: { alignSelf: 'center', paddingVertical: 16 },
  resendText: { fontSize: 13.5, color: colors.primary, fontWeight: '700' },

  hint: { fontSize: 12.5, color: '#B0A098', textAlign: 'center', marginTop: 18, lineHeight: 18 },
})
