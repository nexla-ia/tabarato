import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../src/api/client'
import { colors } from '../src/theme/colors'
import { useToast } from '../src/components/Toast'

const TEXT = '#1A0A00'
const MUTED = '#9A8880'
const BORDER = '#EDE5DF'

function Field({ label, value, onChange, show, onToggle, placeholder, editable }: {
  label: string; value: string; onChange: (v: string) => void
  show: boolean; onToggle: () => void; placeholder: string; editable: boolean
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <Ionicons name="lock-closed-outline" size={18} color="#B0A098" style={{ marginRight: 10 }} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#C0B0A8"
          secureTextEntry={!show}
          autoCapitalize="none"
          editable={editable}
        />
        <TouchableOpacity onPress={onToggle} style={{ paddingLeft: 8 }}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={19} color="#B0A098" />
        </TouchableOpacity>
      </View>
    </View>
  )
}

export default function ChangePasswordScreen() {
  const insets = useSafeAreaInsets()
  const { show: toast } = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [loading, setLoading] = useState(false)

  async function submit() {
    if (!current) { toast('Digite sua senha atual.', 'error'); return }
    if (next.length < 6) { toast('A nova senha precisa de ao menos 6 caracteres.', 'error'); return }
    if (next !== confirm) { toast('A confirmação não bate com a nova senha.', 'error'); return }
    if (next === current) { toast('A nova senha precisa ser diferente da atual.', 'error'); return }

    setLoading(true)
    try {
      await api.patch('/users/me/password', { currentPassword: current, newPassword: next })
      toast('Senha alterada com sucesso.', 'success')
      router.back()
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Não foi possível alterar a senha.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color={TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Alterar senha</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          Para trocar a senha, confirme a atual. Se você não lembra, saia da conta e use
          “Esqueceu a senha?” na tela de login.
        </Text>

        <Field
          label="SENHA ATUAL" value={current} onChange={setCurrent}
          show={showCurrent} onToggle={() => setShowCurrent(v => !v)}
          placeholder="Sua senha de hoje" editable={!loading}
        />
        <Field
          label="NOVA SENHA" value={next} onChange={setNext}
          show={showNext} onToggle={() => setShowNext(v => !v)}
          placeholder="Ao menos 6 caracteres" editable={!loading}
        />
        <Field
          label="CONFIRME A NOVA SENHA" value={confirm} onChange={setConfirm}
          show={showNext} onToggle={() => setShowNext(v => !v)}
          placeholder="Repita a nova senha" editable={!loading}
        />

        <TouchableOpacity style={styles.btn} onPress={submit} disabled={loading} activeOpacity={0.85}>
          <View style={styles.btnInner}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={styles.btnText}>Salvar nova senha</Text></>}
          </View>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFBF7' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 11, backgroundColor: '#F5F0EC',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: TEXT },

  content: { padding: 20 },
  intro: { fontSize: 13.5, color: MUTED, lineHeight: 19, marginBottom: 22 },

  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: MUTED, marginBottom: 6, letterSpacing: 0.3 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, borderWidth: 1.5, borderColor: BORDER,
    paddingHorizontal: 14, minHeight: 52,
  },
  input: { flex: 1, fontSize: 15, color: TEXT, paddingVertical: 14 },

  btn: {
    borderRadius: 14, marginTop: 12,
    shadowColor: colors.primaryDark, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 7,
  },
  btnInner: {
    backgroundColor: colors.primary, paddingVertical: 17,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
    borderRadius: 14, borderBottomWidth: 3, borderBottomColor: colors.primaryDark,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
})
