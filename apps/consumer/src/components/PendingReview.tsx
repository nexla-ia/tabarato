import { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as DocumentPicker from 'expo-document-picker'
import { api } from '../api/client'
import { uploadFile, uploadImageAsset } from '../api/upload'
import { useAuthStore } from '../stores/auth.store'
import { colors } from '../theme/colors'
import { useToast } from './Toast'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

interface StoreLite {
  id?: string
  name?: string
  cnpj?: string
  status?: string
  documentUrl?: string | null
}

function fmtCnpj(v?: string) {
  if (!v) return ''
  return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

const STATUS_UI: Record<string, { icon: IoniconName; tint: string; title: string; desc: string }> = {
  PENDING: {
    icon: 'time-outline', tint: colors.primary,
    title: 'Loja em análise',
    desc: 'Recebemos seu cadastro! Nosso time da Tá Barato está conferindo os dados e aprova em poucas horas. Assim que sua loja for aprovada, o painel de gestão libera automaticamente aqui.',
  },
  REJECTED: {
    icon: 'close-circle-outline', tint: '#DC2626',
    title: 'Cadastro não aprovado',
    desc: 'Não conseguimos aprovar sua loja com os dados atuais. Confira o documento da empresa e fale com o suporte para regularizar.',
  },
  SUSPENDED: {
    icon: 'pause-circle-outline', tint: '#B45309',
    title: 'Loja suspensa',
    desc: 'Sua loja está temporariamente suspensa. Fale com o suporte da Tá Barato para reativar.',
  },
}

const SUPPORT_WHATSAPP = 'https://wa.me/5569999999999' // TODO: número oficial de suporte

export function PendingReview({ store, onRefresh }: { store: StoreLite | null; onRefresh: () => Promise<void> | void }) {
  const insets = useSafeAreaInsets()
  const { show: toast } = useToast()
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const [uploading, setUploading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [docUrl, setDocUrl] = useState<string | null>(store?.documentUrl ?? null)

  const status = store?.status ?? 'PENDING'
  const ui = STATUS_UI[status] ?? STATUS_UI.PENDING

  async function handleRefresh() {
    setRefreshing(true)
    try { await onRefresh() } finally { setRefreshing(false) }
  }

  async function handleUploadDoc() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      })
      if (res.canceled || !res.assets?.[0]) return
      const asset = res.assets[0]
      setUploading(true)
      // Documento pode ser IMAGEM (foto do cartão CNPJ) ou PDF. Se for imagem,
      // converte pra JPEG (resolve HEIC do Samsung); PDF vai cru (converter corromperia).
      const isImage = (asset.mimeType ?? '').startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(asset.name ?? '')
      const url = isImage
        ? await uploadImageAsset(asset.uri, { name: 'documento.jpg' })
        : await uploadFile(asset.uri, { name: asset.name, type: asset.mimeType })
      await api.patch('/stores/my', { documentUrl: url })
      setDocUrl(url)
      toast('Recebemos seu documento. Isso agiliza a aprovação da sua loja.', 'success')
    } catch (err: any) {
      toast(err?.response?.data?.message ?? err?.message ?? 'Não foi possível enviar o documento.', 'error')
    } finally {
      setUploading(false)
    }
  }

  function handleLogout() {
    Alert.alert('Sair da conta', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: async () => { await clearAuth(); router.replace('/(auth)/login') } },
    ])
  }

  // Sem loja cadastrada (conta de lojista sem loja) → convida a finalizar.
  if (!store) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <View style={[styles.badge, { backgroundColor: '#FFF0EB' }]}>
          <Ionicons name="storefront-outline" size={38} color={colors.primary} />
        </View>
        <Text style={styles.title}>Finalize o cadastro da sua loja</Text>
        <Text style={styles.desc}>Você ainda não tem uma loja cadastrada. Complete o cadastro para começar a vender.</Text>
        <TouchableOpacity style={styles.cta} onPress={() => router.push('/(auth)/register-store')} activeOpacity={0.85}>
          <Ionicons name="add-circle-outline" size={18} color="#fff" />
          <Text style={styles.ctaText}>Cadastrar minha loja</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={styles.logoutText}>Sair da conta</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 24 }]}>
        <View style={styles.headerDecor} />
        <View style={styles.headerIcon}>
          <Ionicons name={ui.icon} size={40} color="#fff" />
        </View>
        <Text style={styles.headerTitle}>{ui.title}</Text>
        <Text style={styles.headerSub}>{store.name}</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        {/* Mensagem principal */}
        <View style={styles.card}>
          <Text style={styles.desc}>{ui.desc}</Text>
          {status === 'PENDING' && (
            <View style={styles.autoRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.autoText}>Verificando aprovação automaticamente…</Text>
            </View>
          )}
        </View>

        {/* Dados da loja */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Dados enviados</Text>
          <Row icon="storefront-outline" label="Loja" value={store.name ?? '—'} />
          <Row icon="document-text-outline" label="CNPJ" value={fmtCnpj(store.cnpj) || '—'} />
        </View>

        {/* Documento */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Documento da empresa</Text>
          <Text style={styles.hint}>
            Envie o <Text style={{ fontWeight: '800' }}>Cartão CNPJ</Text> ou, se você for MEI, o{' '}
            <Text style={{ fontWeight: '800' }}>CCMEI</Text> (Certificado do MEI). Imagem ou PDF. Isso agiliza a aprovação.
          </Text>

          {docUrl ? (
            <View style={styles.docOk}>
              <Ionicons name="checkmark-circle" size={20} color="#059669" />
              <Text style={styles.docOkText}>Documento enviado</Text>
              <TouchableOpacity onPress={handleUploadDoc} disabled={uploading}>
                <Text style={styles.docChange}>Trocar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.docBtn} onPress={handleUploadDoc} disabled={uploading} activeOpacity={0.85}>
              {uploading
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <>
                    <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
                    <Text style={styles.docBtnText}>Enviar documento</Text>
                  </>
              }
            </TouchableOpacity>
          )}
        </View>

        {/* Ações */}
        <TouchableOpacity style={styles.cta} onPress={handleRefresh} disabled={refreshing} activeOpacity={0.85}>
          {refreshing
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.ctaText}>Já enviei tudo — verificar aprovação</Text>
              </>
          }
        </TouchableOpacity>

        {(status === 'REJECTED' || status === 'SUSPENDED') && (
          <TouchableOpacity style={styles.supportBtn} onPress={() => Linking.openURL(SUPPORT_WHATSAPP)} activeOpacity={0.85}>
            <Ionicons name="logo-whatsapp" size={18} color="#059669" />
            <Text style={styles.supportText}>Falar com o suporte</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={17} color="#DC2626" />
          <Text style={styles.logoutText}>Sair da conta</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

function Row({ icon, label, value }: { icon: IoniconName; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={15} color="#9A8880" />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAF6F2' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 28 },

  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24, paddingBottom: 30,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
    alignItems: 'center', overflow: 'hidden', position: 'relative',
  },
  headerDecor: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.08)', top: -70, right: -50,
  },
  headerIcon: {
    width: 76, height: 76, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  headerTitle: { fontSize: 23, fontWeight: '900', color: '#fff', letterSpacing: -0.4, textAlign: 'center' },
  headerSub: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 3 },

  body: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: '#F0E8E0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  desc: { fontSize: 14, color: '#5A4636', lineHeight: 21 },

  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  autoText: { fontSize: 12.5, color: colors.primary, fontWeight: '700' },

  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#9A8880', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 },
  rowLabel: { fontSize: 13, color: '#9A8880', fontWeight: '600', width: 54 },
  rowValue: { flex: 1, fontSize: 13.5, color: '#1A0A00', fontWeight: '700' },

  hint: { fontSize: 12.5, color: '#7A5C4A', lineHeight: 18, marginBottom: 14 },
  docBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: colors.primary, borderStyle: 'dashed',
    borderRadius: 12, paddingVertical: 14, backgroundColor: '#FFF3EB',
  },
  docBtnText: { fontSize: 14, color: colors.primary, fontWeight: '800' },
  docOk: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#BBF7D0',
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
  },
  docOkText: { flex: 1, fontSize: 13.5, color: '#15803D', fontWeight: '800' },
  docChange: { fontSize: 13, color: colors.primary, fontWeight: '800' },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 14,
    borderBottomWidth: 3, borderBottomColor: colors.primaryDark, marginTop: 4,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  supportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0',
    paddingVertical: 14, borderRadius: 14,
  },
  supportText: { color: '#059669', fontSize: 14, fontWeight: '800' },

  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, marginTop: 4 },
  logoutText: { color: '#DC2626', fontSize: 14, fontWeight: '700' },

  title: { fontSize: 20, fontWeight: '900', color: '#1A0A00', textAlign: 'center', marginBottom: 8 },
  badge: { width: 84, height: 84, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
})
