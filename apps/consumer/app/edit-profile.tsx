import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { useAuthStore } from '../src/stores/auth.store'
import { api } from '../src/api/client'
import { uploadImageAsset } from '../src/api/upload'
import { colors } from '../src/theme/colors'
import { formatPhoneBR } from '../src/utils/phone'
import { useToast } from '../src/components/Toast'

function Field({
  label, value, onChangeText, placeholder, keyboardType, autoCapitalize, maxLength,
}: {
  label: string
  value: string
  onChangeText: (v: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'phone-pad'
  autoCapitalize?: 'none' | 'sentences' | 'words'
  maxLength?: number
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
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        maxLength={maxLength}
      />
    </View>
  )
}

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets()
  const { show: toast } = useToast()
  const { user, setUser } = useAuthStore()
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState(user?.name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [city, setCity] = useState(user?.city ?? '')
  const [state, setState] = useState(user?.state ?? '')
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { toast('Permita acesso à galeria nas configurações.', 'error'); return }
    // SEM allowsEditing: o corte do expo-image-picker trava no Android real.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    })
    if (result.canceled) return
    const asset = result.assets?.[0]
    if (!asset?.uri) { toast('Não consegui ler a imagem selecionada. Tente escolher outra.', 'error'); return }
    setUploadingAvatar(true)
    try {
      const url = await uploadImageAsset(asset.uri, { name: 'avatar.jpg' })
      setAvatarUrl(url)
    } catch (e: any) {
      toast(e?.message ?? 'Não foi possível enviar a foto.', 'error')
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function handleSave() {
    if (!name.trim()) { toast('O nome não pode ficar vazio.', 'info'); return }
    setSaving(true)
    try {
      const { data } = await api.patch('/users/me', {
        name: name.trim(),
        phone: phone.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        avatarUrl: avatarUrl || undefined,
      })
      setUser(data)
      router.back()
    } catch (err: any) {
      const msg = err.response?.data?.message
      toast(Array.isArray(msg) ? msg.join('\n') : (msg ?? 'Não foi possível salvar.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color="#1A0A00" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Editar perfil</Text>
        <TouchableOpacity style={styles.saveHeaderBtn} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
          {saving
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Text style={styles.saveHeaderText}>Salvar</Text>
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar} activeOpacity={0.85} disabled={uploadingAvatar}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{name[0]?.toUpperCase() ?? '?'}</Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              {uploadingAvatar
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="camera" size={14} color="#fff" />
              }
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarEmail}>{user?.email}</Text>
          <Text style={styles.avatarHint}>Toque na foto para alterar • E-mail não pode ser alterado</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dados pessoais</Text>
          <Field label="Nome completo" value={name} onChangeText={setName} placeholder="Seu nome" autoCapitalize="words" />
          <Field label="Telefone" value={phone} onChangeText={(v) => setPhone(formatPhoneBR(v))} placeholder="(69) 99999-9999" keyboardType="phone-pad" autoCapitalize="none" maxLength={15} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Localização</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Cidade" value={city} onChangeText={setCity} placeholder="Vilhena" autoCapitalize="words" />
            </View>
            <View style={{ width: 80 }}>
              <Field label="Estado" value={state} onChangeText={(v) => setState(v.toUpperCase().slice(0, 2))} placeholder="RO" autoCapitalize="none" />
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="checkmark-outline" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Salvar alterações</Text>
              </>
          }
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },

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
  saveHeaderBtn: { paddingHorizontal: 14, paddingVertical: 8 },
  saveHeaderText: { fontSize: 15, fontWeight: '700', color: colors.primary },

  content: { padding: 16 },

  avatarSection: { alignItems: 'center', paddingVertical: 24 },
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImg: { width: 88, height: 88, borderRadius: 44 },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#1A0A00',
    borderWidth: 2, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 36, fontWeight: '900', color: '#fff' },
  avatarEmail: { fontSize: 14, fontWeight: '600', color: '#1A0A00', marginBottom: 4 },
  avatarHint: { fontSize: 12, color: '#9A8880', textAlign: 'center' },

  card: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 18, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardTitle: { fontSize: 13, fontWeight: '800', color: '#9A8880', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 },

  row: { flexDirection: 'row', gap: 12 },

  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#9A8880', marginBottom: 6, letterSpacing: 0.3 },
  fieldInput: {
    backgroundColor: '#F5F0EC', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1A0A00',
    borderWidth: 1.5, borderColor: '#EDE5DF',
  },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 16, borderRadius: 14,
    borderBottomWidth: 3, borderBottomColor: colors.primaryDark,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
    minHeight: 56,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
})
