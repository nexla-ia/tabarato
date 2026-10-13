import { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { api } from '../src/api/client'
import { uploadDocumentImage } from '../src/api/upload'
import { colors } from '../src/theme/colors'
import { useToast } from '../src/components/Toast'
import { LoadError } from '../src/components/LoadError'

const TEXT = '#1A0A00'
const MUTED = '#9A8880'
const BORDER = '#F0E8E0'
const CARD = '#FFFFFF'

type DocKey = 'cnh' | 'identity' | 'vehicle'

const DOCS: { key: DocKey; label: string; desc: string; statusField: string; photoField: string }[] = [
  { key: 'cnh', label: 'CNH', desc: 'Habilitação com EAR', statusField: 'cnhStatus', photoField: 'cnhPhotoUrl' },
  { key: 'identity', label: 'Identidade', desc: 'RG ou documento com foto', statusField: 'identityStatus', photoField: 'identityPhotoUrl' },
  { key: 'vehicle', label: 'Documento do veículo', desc: 'CRLV da moto', statusField: 'vehicleDocStatus', photoField: 'vehicleDocPhotoUrl' },
]

const STATUS: Record<string, { label: string; fg: string; bg: string; icon: any }> = {
  APPROVED: { label: 'Aprovado', fg: '#15803D', bg: '#DCFCE7', icon: 'checkmark-circle' },
  REJECTED: { label: 'Reprovado', fg: '#B91C1C', bg: '#FEE2E2', icon: 'close-circle' },
  PENDING: { label: 'Em análise', fg: '#B45309', bg: '#FEF3C7', icon: 'time' },
}

export default function CourierDocumentsScreen() {
  const insets = useSafeAreaInsets()
  const { show: toast } = useToast()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [sending, setSending] = useState<DocKey | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setLoadError(false)
    try {
      const { data } = await api.get('/couriers/me')
      setProfile(data)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { load(true); setLoading(true); load() }, [load]))

  // Mesmo fluxo do reenvio que já existe na home — a conta volta para análise.
  async function resend(doc: DocKey, label: string) {
    if (sending) return
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) { toast('Permita o acesso à galeria para reenviar.', 'error'); return }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85,
      })
      if (result.canceled) return
      const uri = result.assets?.[0]?.uri
      if (!uri) { toast('Não consegui ler a imagem. Tente outra.', 'error'); return }

      setSending(doc)
      const path = await uploadDocumentImage(uri, { name: `${doc}.jpg` })
      await api.patch('/couriers/me/documents', { document: doc, url: path })
      toast(`${label} reenviado! Voltou para análise.`, 'success')
      load(true)
    } catch (e: any) {
      toast(e?.response?.data?.message ?? 'Não foi possível reenviar o documento.', 'error')
    } finally {
      setSending(null)
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color={TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Meus documentos</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 60 }} />
      ) : loadError ? (
        <LoadError onRetry={() => load()} sub="Não conseguimos buscar seus documentos." />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true) }} tintColor={colors.primary} />
          }
        >
          <Text style={styles.intro}>
            Documentos enviados no cadastro. Se algum for reprovado, envie outro aqui mesmo —
            sua conta volta para análise.
          </Text>

          {DOCS.map((d) => {
            const raw = profile?.[d.statusField] as string | null
            const st = STATUS[raw ?? 'PENDING'] ?? STATUS.PENDING
            const photo = profile?.[d.photoField] as string | null
            const rejected = raw === 'REJECTED'
            return (
              <View key={d.key} style={[styles.card, rejected && styles.cardRejected]}>
                <View style={styles.cardTop}>
                  {photo ? (
                    <Image source={{ uri: photo }} style={styles.thumb} resizeMode="cover" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <Ionicons name="document-text-outline" size={22} color={MUTED} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docLabel}>{d.label}</Text>
                    <Text style={styles.docDesc}>{d.desc}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: st.bg }]}>
                    <Ionicons name={st.icon} size={12} color={st.fg} />
                    <Text style={[styles.badgeText, { color: st.fg }]}>{st.label}</Text>
                  </View>
                </View>

                {rejected && (
                  <TouchableOpacity
                    style={[styles.resendBtn, sending === d.key && { opacity: 0.6 }]}
                    onPress={() => resend(d.key, d.label)}
                    disabled={sending !== null}
                    activeOpacity={0.85}
                  >
                    {sending === d.key ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={15} color="#fff" />
                        <Text style={styles.resendText}>Enviar outro documento</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )
          })}

          <Text style={styles.footer}>
            A análise é feita pela equipe do Tá Barato e costuma levar até 1 dia útil.
          </Text>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFBF7' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14,
    backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 11, backgroundColor: '#F5F0EC',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: TEXT },

  content: { padding: 16 },
  intro: { fontSize: 13.5, color: MUTED, lineHeight: 19, marginBottom: 18 },

  card: {
    backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: BORDER,
  },
  cardRejected: { borderColor: '#FECACA' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 46, height: 46, borderRadius: 10, backgroundColor: '#F5F0EC' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  docLabel: { fontSize: 14.5, fontWeight: '800', color: TEXT },
  docDesc: { fontSize: 12, color: MUTED, marginTop: 2 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, flexShrink: 0,
  },
  badgeText: { fontSize: 11, fontWeight: '800' },

  resendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: colors.primary, borderRadius: 11, paddingVertical: 12, marginTop: 12,
  },
  resendText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  footer: { fontSize: 12.5, color: MUTED, textAlign: 'center', marginTop: 12, lineHeight: 18 },
})
