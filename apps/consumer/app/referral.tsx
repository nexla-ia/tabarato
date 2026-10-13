import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Share, ActivityIndicator, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import { api } from '../src/api/client'
import { colors } from '../src/theme/colors'
import { useToast } from '../src/components/Toast'

const PRIMARY = colors.primary
const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const BG = '#FFF8F3'
const CARD = '#FFFFFF'
const BORDER = '#F0E8E0'

export default function ReferralScreen() {
  const insets = useSafeAreaInsets()
  const { show: toast } = useToast()
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const [shareText, setShareText] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    api.get('/users/me/referral')
      .then(r => {
        setReferralCode(r.data.referralCode)
        setShareText(r.data.shareText)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

  async function handleShare() {
    try {
      await Share.share({ message: shareText, title: 'Indique o Tá Barato' })
    } catch {}
  }

  async function handleCopy() {
    if (!referralCode) return
    await Clipboard.setStringAsync(referralCode)
    toast(`Código ${referralCode} copiado para a área de transferência.`, 'success')
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <Text style={styles.title}>Indique e Ganhe</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={PRIMARY} style={{ marginTop: 60 }} size="large" />
      ) : (
        <View style={styles.content}>
          {/* Hero */}
          <View style={styles.hero}>
            <View style={styles.heroDecor} />
            <Ionicons name="gift" size={48} color="#fff" style={{ marginBottom: 12 }} />
            <Text style={styles.heroTitle}>Ganhe 50 pontos{'\n'}por cada amigo!</Text>
            <Text style={styles.heroSub}>Seu amigo também ganha 50 pontos de boas-vindas</Text>
          </View>

          {/* Code */}
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>SEU CÓDIGO DE INDICAÇÃO</Text>
            {loadError && !referralCode ? (
              <>
                <Text style={[styles.code, { fontSize: 15, letterSpacing: 0 }]}>Não foi possível carregar</Text>
                <Text style={{ fontSize: 12.5, color: MUTED, marginTop: 4, textAlign: 'center' }}>Verifique a conexão e tente novamente.</Text>
              </>
            ) : (
              <>
                <Text style={styles.code}>{referralCode ?? '------'}</Text>
                <TouchableOpacity style={styles.copyBtn} onPress={handleCopy} activeOpacity={0.8} disabled={!referralCode}>
                  <Ionicons name="copy-outline" size={16} color={PRIMARY} />
                  <Text style={styles.copyBtnText}>Copiar código</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Steps */}
          <View style={styles.stepsCard}>
            {[
              { step: '1', text: 'Compartilhe seu código com amigos' },
              { step: '2', text: 'Amigo se cadastra usando seu código' },
              { step: '3', text: 'Vocês dois ganham 50 pontos = R$5 off' },
            ].map(s => (
              <View key={s.step} style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>{s.step}</Text></View>
                <Text style={styles.stepText}>{s.text}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.88}>
            <Ionicons name="share-social-outline" size={20} color="#fff" />
            <Text style={styles.shareBtnText}>Compartilhar convite</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#F5F0EC', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '900', color: TEXT },
  content: { flex: 1, padding: 16, gap: 14 },

  hero: {
    backgroundColor: PRIMARY, borderRadius: 20, padding: 28,
    alignItems: 'center', overflow: 'hidden', position: 'relative',
  },
  heroDecor: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)', top: -40, right: -30,
  },
  heroTitle: { fontSize: 24, fontWeight: '900', color: '#fff', textAlign: 'center', letterSpacing: -0.4, marginBottom: 8 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },

  codeCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 20,
    alignItems: 'center', borderWidth: 2, borderColor: PRIMARY, gap: 12,
  },
  codeLabel: { fontSize: 11, fontWeight: '800', color: MUTED, letterSpacing: 1 },
  code: { fontSize: 36, fontWeight: '900', color: PRIMARY, letterSpacing: 6 },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFF0EB', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8,
  },
  copyBtnText: { fontSize: 13, fontWeight: '700', color: PRIMARY },

  stepsCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: BORDER, gap: 14,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  stepText: { flex: 1, fontSize: 13, color: MUTED, lineHeight: 18 },

  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 16,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, elevation: 6,
  },
  shareBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
})
