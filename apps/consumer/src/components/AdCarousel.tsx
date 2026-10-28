import { useEffect, useRef, useState } from 'react'
import {
  View, Text, Image, TouchableOpacity, StyleSheet, FlatList, Dimensions, Linking,
  NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { colors } from '../theme/colors'

interface LiveAd {
  id: string
  companyName: string
  imageUrl: string
  linkType: 'NONE' | 'STORE' | 'WHATSAPP' | 'URL'
  linkTarget: string | null
}

type Slide = { kind: 'ad'; ad: LiveAd } | { kind: 'house' }

const { width: SCREEN_W } = Dimensions.get('window')
const H_PAD = 16
const SLIDE_W = SCREEN_W - H_PAD * 2
// Mesma proporção da arte que o servidor grava (1200 × 400).
const SLIDE_H = Math.round(SLIDE_W / 3)
const GIRO_MS = 5000

// Uma exibição por anúncio por abertura do app — rolar o carrossel de volta
// não pode inflar o número que o anunciante paga para ver.
const exibidos = new Set<string>()

function registrarExibicao(id: string) {
  if (exibidos.has(id)) return
  exibidos.add(id)
  api.post(`/ads/${id}/view`).catch(() => {})
}

function abrir(ad: LiveAd) {
  api.post(`/ads/${ad.id}/click`).catch(() => {})
  if (ad.linkType === 'STORE' && ad.linkTarget) router.push(`/store/${ad.linkTarget}`)
  else if (ad.linkType === 'WHATSAPP' && ad.linkTarget) Linking.openURL(`https://wa.me/${ad.linkTarget}`).catch(() => {})
  else if (ad.linkType === 'URL' && ad.linkTarget) Linking.openURL(ad.linkTarget).catch(() => {})
}

/**
 * Carrossel de anúncios pagos no topo da home. Vaga sobrando vira o card
 * "Anuncie aqui". Sem anúncio e sem vaga (ou a API fora), não ocupa espaço.
 */
export function AdCarousel() {
  const { data } = useQuery<{ ads: LiveAd[]; showHouseAd: boolean }>({
    queryKey: ['ads', 'live'],
    queryFn: async () => (await api.get('/ads/live')).data,
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const slides: Slide[] = [
    ...(data?.ads ?? []).map((ad) => ({ kind: 'ad' as const, ad })),
    ...(data?.showHouseAd ? [{ kind: 'house' as const }] : []),
  ]

  const listRef = useRef<FlatList<Slide>>(null)
  const [atual, setAtual] = useState(0)
  const tocando = useRef(false)

  // Conta a exibição do slide que está na tela.
  useEffect(() => {
    const s = slides[atual]
    if (s?.kind === 'ad') registrarExibicao(s.ad.id)
  }, [atual, slides.length])

  // Gira sozinho; pausa enquanto o dedo está no carrossel.
  useEffect(() => {
    if (slides.length < 2) return
    const t = setInterval(() => {
      if (tocando.current) return
      const prox = (atual + 1) % slides.length
      listRef.current?.scrollToOffset({ offset: prox * (SLIDE_W + 10), animated: true })
      setAtual(prox)
    }, GIRO_MS)
    return () => clearInterval(t)
  }, [atual, slides.length])

  if (slides.length === 0) return null

  function aoRolar(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / (SLIDE_W + 10))
    if (i !== atual && i >= 0 && i < slides.length) setAtual(i)
  }

  return (
    <View style={s.wrap}>
      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SLIDE_W + 10}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: H_PAD, gap: 10 }}
        keyExtractor={(it) => (it.kind === 'ad' ? it.ad.id : 'house')}
        onMomentumScrollEnd={aoRolar}
        onScrollBeginDrag={() => { tocando.current = true }}
        onScrollEndDrag={() => { tocando.current = false }}
        renderItem={({ item }) =>
          item.kind === 'ad' ? (
            <TouchableOpacity
              activeOpacity={item.ad.linkType === 'NONE' ? 1 : 0.9}
              onPress={() => abrir(item.ad)}
              disabled={item.ad.linkType === 'NONE'}
              style={s.slide}
              accessibilityLabel={`Anúncio de ${item.ad.companyName}`}
            >
              <Image source={{ uri: item.ad.imageUrl }} style={s.arte} resizeMode="cover" />
              {/* Anúncio tem que ser identificado como anúncio (CDC art. 36). */}
              <View style={s.selo}><Text style={s.seloTxt}>Patrocinado</Text></View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity activeOpacity={0.9} onPress={() => router.push('/anunciar' as any)} style={[s.slide, s.casa]}>
              <View style={s.casaBola1} />
              <View style={s.casaBola2} />
              <View style={{ flex: 1 }}>
                <Text style={s.casaKicker}>SUA EMPRESA AQUI</Text>
                <Text style={s.casaTitulo} numberOfLines={2}>Apareça para toda Vilhena na tela inicial</Text>
              </View>
              <View style={s.casaBtn}>
                <Text style={s.casaBtnTxt}>Anunciar</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.primary} />
              </View>
            </TouchableOpacity>
          )
        }
      />
      {slides.length > 1 && (
        <View style={s.pontos}>
          {slides.map((_, i) => <View key={i} style={[s.ponto, i === atual && s.pontoAtivo]} />)}
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { marginTop: 14, marginBottom: 2 },
  slide: {
    width: SLIDE_W, height: SLIDE_H, borderRadius: 16, overflow: 'hidden',
    backgroundColor: colors.primaryLight,
  },
  arte: { width: '100%', height: '100%' },
  selo: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: 'rgba(26,10,0,0.55)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  seloTxt: { color: '#fff', fontSize: 9.5, fontWeight: '700', letterSpacing: 0.3 },

  casa: {
    backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, gap: 12,
  },
  casaBola1: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.10)', top: -50, right: -30,
  },
  casaBola2: {
    position: 'absolute', width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.08)', bottom: -30, left: 40,
  },
  casaKicker: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 3 },
  casaTitulo: { color: '#fff', fontSize: 15, fontWeight: '900', lineHeight: 19 },
  casaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8,
  },
  casaBtnTxt: { color: colors.primary, fontSize: 12.5, fontWeight: '900' },

  pontos: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 8 },
  ponto: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E8D9CE' },
  pontoAtivo: { width: 16, backgroundColor: colors.primary },
})
