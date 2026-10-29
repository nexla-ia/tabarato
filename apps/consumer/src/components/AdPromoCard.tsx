import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useCallback } from 'react'
import { router, useFocusEffect } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { colors } from '../theme/colors'
import { AdConfig, MyAd, brl, ctr, dataCurta } from '../utils/ads'

/**
 * Janela de anúncio no painel do lojista (pedido do Ricardo, ao lado de
 * "Últimos 7 dias"). Muda com a situação: anúncio no ar mostra os números;
 * aprovado mostra que falta pagar; sem anúncio, convida a anunciar.
 */
export function AdPromoCard() {
  const { data: ads, refetch } = useQuery<MyAd[]>({
    queryKey: ['ads', 'mine'],
    queryFn: async () => (await api.get('/ads/mine')).data,
    staleTime: 60_000,
    retry: 1,
  })
  // O painel fica montado nas abas: ao voltar de "Meus anúncios" (pagou, cancelou),
  // o card tem que refletir na hora.
  useFocusEffect(useCallback(() => { refetch() }, [refetch]))
  const { data: config } = useQuery<AdConfig>({
    queryKey: ['ads', 'config'],
    queryFn: async () => (await api.get('/ads/config')).data,
    staleTime: 10 * 60_000,
    retry: 1,
  })

  const noAr = ads?.find((a) => a.live)
  const aPagar = ads?.find((a) => a.status === 'AWAITING_PAYMENT')
  const emAnalise = ads?.find((a) => a.status === 'PENDING_REVIEW')
  const agendado = ads?.find((a) => a.status === 'PAID' && !a.live && a.startsAt && new Date(a.startsAt) > new Date())

  const irPara = (rota: string) => () => router.push(rota as any)

  if (noAr) {
    return (
      <TouchableOpacity style={s.card} onPress={irPara('/meus-anuncios')} activeOpacity={0.9}>
        <View style={s.topo}>
          <View style={[s.pilula, { backgroundColor: '#DCFCE7' }]}>
            <View style={s.pontoVivo} />
            <Text style={[s.pilulaTxt, { color: '#15803D' }]}>Anúncio no ar</Text>
          </View>
          <Text style={s.ate}>até {noAr.endsAt ? dataCurta(noAr.endsAt) : '—'}</Text>
        </View>
        <View style={s.numeros}>
          <Numero valor={noAr.impressions.toLocaleString('pt-BR')} rotulo="exibições" />
          <Numero valor={noAr.clicks.toLocaleString('pt-BR')} rotulo="cliques" />
          <Numero valor={`${ctr(noAr)}%`} rotulo="taxa de clique" />
        </View>
      </TouchableOpacity>
    )
  }

  if (aPagar || emAnalise || agendado) {
    const [icone, titulo, sub] = aPagar
      ? ['qr-code', 'Anúncio aprovado', `Pague o PIX de ${brl(aPagar.totalPrice)} para entrar no ar`] as const
      : agendado
        ? ['calendar', 'Anúncio agendado', `Entra no ar em ${dataCurta(agendado.startsAt!)}`] as const
        : ['time', 'Anúncio em análise', 'Avisamos assim que a arte for aprovada'] as const
    return (
      <TouchableOpacity style={[s.card, s.linha]} onPress={irPara('/meus-anuncios')} activeOpacity={0.9}>
        <View style={s.icone}><Ionicons name={icone} size={20} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.titulo}>{titulo}</Text>
          <Text style={s.sub}>{sub}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.primary} />
      </TouchableOpacity>
    )
  }

  return (
    <TouchableOpacity style={[s.card, s.convite]} onPress={irPara('/anunciar')} activeOpacity={0.9}>
      <View style={s.bola} />
      <View style={{ flex: 1 }}>
        <Text style={s.conviteKicker}>VITRINE DO APP</Text>
        <Text style={s.conviteTitulo}>Coloque sua loja no topo da tela inicial</Text>
        {config && <Text style={s.conviteSub}>A partir de {brl(config.pricePerDay)} por dia · paga só se aprovado</Text>}
      </View>
      <View style={s.conviteBtn}>
        <Ionicons name="megaphone" size={18} color={colors.primary} />
      </View>
    </TouchableOpacity>
  )
}

function Numero({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <View style={s.numero}>
      <Text style={s.numeroValor}>{valor}</Text>
      <Text style={s.numeroRotulo}>{rotulo}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  pilula: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pontoVivo: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E' },
  pilulaTxt: { fontSize: 12, fontWeight: '800' },
  ate: { fontSize: 12, color: '#9A8880', fontWeight: '600' },
  numeros: { flexDirection: 'row', gap: 8 },
  numero: { flex: 1, backgroundColor: '#FFF0EB', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  numeroValor: { fontSize: 17, fontWeight: '900', color: colors.primary, fontVariant: ['tabular-nums'] },
  numeroRotulo: { fontSize: 10.5, fontWeight: '600', color: '#9A8880', marginTop: 1 },

  icone: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#FFF0EB', alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 14.5, fontWeight: '800', color: '#1A0A00' },
  sub: { fontSize: 12, color: '#9A8880', marginTop: 2 },

  convite: { backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  bola: {
    position: 'absolute', width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.10)', top: -50, right: -20,
  },
  conviteKicker: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.85)', letterSpacing: 1.1, marginBottom: 3 },
  conviteTitulo: { fontSize: 15, fontWeight: '900', color: '#fff', lineHeight: 19 },
  conviteSub: { fontSize: 11.5, color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  conviteBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
})
