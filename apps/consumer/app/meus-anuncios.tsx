import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator,
  Modal, RefreshControl, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../src/api/client'
import { colors } from '../src/theme/colors'
import { useToast } from '../src/components/Toast'
import { LoadError } from '../src/components/LoadError'
import { MyAd, brl, ctr, dataCurta, faseDoAnuncio } from '../src/utils/ads'

const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const BORDER = '#F0E8E0'

export default function MeusAnunciosScreen() {
  const insets = useSafeAreaInsets()
  const [ads, setAds] = useState<MyAd[] | null>(null)
  const [erro, setErro] = useState(false)
  const [atualizando, setAtualizando] = useState(false)
  const [pagando, setPagando] = useState<MyAd | null>(null)

  const carregar = useCallback(() => {
    setErro(false)
    return api.get<MyAd[]>('/ads/mine')
      .then((r) => setAds(r.data))
      .catch(() => setErro(true))
  }, [])

  // Recarrega ao voltar para a tela (ex.: depois de pagar ou de enviar um novo).
  useFocusEffect(useCallback(() => { carregar() }, [carregar]))

  async function puxar() {
    setAtualizando(true)
    await carregar()
    setAtualizando(false)
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.icone}>
          <Ionicons name="arrow-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <Text style={s.titulo}>Meus anúncios</Text>
        <TouchableOpacity onPress={() => router.push('/anunciar' as any)} style={s.icone}>
          <Ionicons name="add" size={26} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {erro ? (
        <LoadError onRetry={carregar} sub="Não conseguimos buscar seus anúncios. Verifique a conexão." />
      ) : !ads ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} size="large" />
      ) : ads.length === 0 ? (
        <View style={s.vazio}>
          <View style={s.vazioIcone}><Ionicons name="megaphone" size={30} color={colors.primary} /></View>
          <Text style={s.vazioTitulo}>Nenhum anúncio ainda</Text>
          <Text style={s.vazioTexto}>Coloque sua empresa no topo da tela inicial do Tá Barato. Você só paga depois que aprovarmos a arte.</Text>
          <TouchableOpacity style={s.cta} onPress={() => router.push('/anunciar' as any)} activeOpacity={0.85}>
            <Text style={s.ctaTxt}>Criar meu anúncio</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 14 }}
          refreshControl={<RefreshControl refreshing={atualizando} onRefresh={puxar} tintColor={colors.primary} />}
        >
          {ads.map((ad) => (
            <CartaoAnuncio key={ad.id} ad={ad} onPagar={() => setPagando(ad)} onMudou={carregar} />
          ))}
        </ScrollView>
      )}

      {pagando && (
        <PagamentoPix
          ad={pagando}
          onFechar={() => { setPagando(null); carregar() }}
        />
      )}
    </View>
  )
}

function CartaoAnuncio({ ad, onPagar, onMudou }: { ad: MyAd; onPagar: () => void; onMudou: () => void }) {
  const { show: toast } = useToast()
  const fase = faseDoAnuncio(ad)
  const terminou = ad.status === 'PAID' && !ad.live && !!ad.endsAt && new Date(ad.endsAt) <= new Date()
  const temMetricas = ad.status === 'PAID' && (ad.live || terminou)

  function cancelar() {
    Alert.alert('Cancelar pedido de anúncio?', 'Nada foi cobrado. Você pode pedir de novo quando quiser.', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar pedido', style: 'destructive',
        onPress: () => api.post(`/ads/mine/${ad.id}/cancel`)
          .then(() => { toast('Pedido cancelado.', 'success'); onMudou() })
          .catch((e) => toast(e?.response?.data?.message ?? 'Não foi possível cancelar.', 'error')),
      },
    ])
  }

  return (
    <View style={s.cartao}>
      <Image source={{ uri: ad.imageUrl }} style={s.arte} resizeMode="cover" />
      <View style={s.corpo}>
        <View style={s.linhaTopo}>
          <View style={[s.pilula, { backgroundColor: fase.fundo }]}>
            <Text style={[s.pilulaTxt, { color: fase.cor }]}>{fase.label}</Text>
          </View>
          <Text style={s.valor}>{brl(ad.totalPrice)} · {ad.days} dias</Text>
        </View>

        {ad.status === 'PENDING_REVIEW' && (
          <Text style={s.texto}>A equipe está conferindo a arte. Avisamos por aqui quando aprovar.</Text>
        )}
        {ad.status === 'AWAITING_PAYMENT' && (
          <Text style={s.texto}>
            Pague até <Text style={s.forte}>{ad.payDeadline ? dataCurta(ad.payDeadline) : '—'}</Text>.
            {' '}Depois do PIX, o anúncio entra no ar sozinho.
          </Text>
        )}
        {ad.status === 'REJECTED' && (
          <Text style={s.texto}>
            <Text style={s.forte}>Motivo: </Text>{ad.rejectReason ?? '—'}. Nada foi cobrado.
          </Text>
        )}
        {ad.status === 'EXPIRED_UNPAID' && (
          <Text style={s.texto}>O prazo para pagar acabou e o pedido foi encerrado. Nada foi cobrado.</Text>
        )}
        {ad.status === 'PAID' && ad.startsAt && ad.endsAt && (
          <Text style={s.texto}>
            {ad.live ? 'No ar até ' : terminou ? 'Ficou no ar de ' : 'Entra no ar em '}
            <Text style={s.forte}>
              {ad.live ? dataCurta(ad.endsAt) : terminou ? `${dataCurta(ad.startsAt)} a ${dataCurta(ad.endsAt)}` : `${dataCurta(ad.startsAt)} (até ${dataCurta(ad.endsAt)})`}
            </Text>
          </Text>
        )}

        {temMetricas && (
          <View style={s.metricas}>
            <Metrica valor={ad.impressions.toLocaleString('pt-BR')} rotulo="exibições" />
            <Metrica valor={ad.clicks.toLocaleString('pt-BR')} rotulo="cliques" />
            <Metrica valor={`${ctr(ad)}%`} rotulo="taxa de clique" />
          </View>
        )}

        <View style={s.acoes}>
          {ad.status === 'AWAITING_PAYMENT' && (
            <TouchableOpacity style={[s.cta, { flex: 1 }]} onPress={onPagar} activeOpacity={0.85}>
              <Ionicons name="qr-code" size={16} color="#fff" />
              <Text style={s.ctaTxt}>Pagar com PIX</Text>
            </TouchableOpacity>
          )}
          {(ad.status === 'PENDING_REVIEW' || ad.status === 'AWAITING_PAYMENT') && (
            <TouchableOpacity style={s.secundario} onPress={cancelar}>
              <Text style={s.secundarioTxt}>Cancelar</Text>
            </TouchableOpacity>
          )}
          {(ad.status === 'REJECTED' || ad.status === 'EXPIRED_UNPAID' || terminou || (ad.status === 'PAID' && ad.live)) && (
            <TouchableOpacity
              style={[s.secundario, { flex: 1 }]}
              onPress={() => router.push({ pathname: '/anunciar', params: { de: ad.id } } as any)}
            >
              <Ionicons name="refresh" size={15} color={colors.primary} />
              <Text style={s.secundarioTxt}>{ad.status === 'REJECTED' ? 'Enviar nova arte' : ad.live ? 'Renovar' : 'Anunciar de novo'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )
}

function Metrica({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <View style={s.metrica}>
      <Text style={s.metricaValor}>{valor}</Text>
      <Text style={s.metricaRotulo}>{rotulo}</Text>
    </View>
  )
}

/** Gera o PIX, mostra QR + copia e cola e confere sozinho até cair. */
function PagamentoPix({ ad, onFechar }: { ad: MyAd; onFechar: () => void }) {
  const insets = useSafeAreaInsets()
  const { show: toast } = useToast()
  const [dados, setDados] = useState<MyAd | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pago, setPago] = useState(false)
  const vivo = useRef(true)

  function gerar() {
    setErro(null); setDados(null)
    api.post<MyAd>(`/ads/mine/${ad.id}/pay`)
      .then((r) => {
        if (r.data.status === 'PAID') setPago(true)
        setDados(r.data)
      })
      .catch((e) => setErro(e?.response?.data?.message ?? 'Não foi possível gerar o PIX agora.'))
  }

  useEffect(() => {
    vivo.current = true
    gerar()
    return () => { vivo.current = false }
  }, [])

  // Confere a cada 5 s. GET /ads/mine/:id consulta o banco e o provedor.
  useEffect(() => {
    if (!dados || pago) return
    const t = setInterval(() => {
      api.get<MyAd>(`/ads/mine/${ad.id}`).then((r) => {
        if (!vivo.current) return
        if (r.data.status === 'PAID') { setPago(true); setDados(r.data) }
      }).catch(() => {})
    }, 5000)
    return () => clearInterval(t)
  }, [dados, pago])

  async function copiar() {
    if (!dados?.pix?.code) return
    await Clipboard.setStringAsync(dados.pix.code)
    toast('Código PIX copiado!', 'success')
  }

  const previsto = dados?.projectedStartsAt
  const entraAgora = previsto ? new Date(previsto).getTime() - Date.now() < 60 * 60 * 1000 : true

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onFechar}>
      <View style={[s.modal, { paddingBottom: insets.bottom + 20 }]}>
        <View style={s.modalTopo}>
          <Text style={s.modalTitulo}>{pago ? 'Pagamento confirmado' : 'Pagar anúncio'}</Text>
          <TouchableOpacity onPress={onFechar} hitSlop={10}><Ionicons name="close" size={24} color={TEXT} /></TouchableOpacity>
        </View>

        {pago && dados ? (
          <View style={s.pagoBox}>
            <View style={s.pagoIcone}><Ionicons name="checkmark" size={34} color="#fff" /></View>
            <Text style={s.pagoTitulo}>{dados.live ? 'Seu anúncio está no ar!' : 'Anúncio agendado'}</Text>
            <Text style={s.pagoTexto}>
              {dados.live && dados.endsAt
                ? `Ele já aparece na tela inicial e fica até ${dataCurta(dados.endsAt)}.`
                : dados.startsAt && dados.endsAt
                  ? `Ele entra no ar em ${dataCurta(dados.startsAt)} e fica até ${dataCurta(dados.endsAt)}.`
                  : 'Já registramos o pagamento.'}
            </Text>
            <TouchableOpacity style={[s.cta, { alignSelf: 'stretch' }]} onPress={onFechar}>
              <Text style={s.ctaTxt}>Ver meus anúncios</Text>
            </TouchableOpacity>
          </View>
        ) : erro ? (
          <View style={s.pagoBox}>
            <Ionicons name="alert-circle-outline" size={40} color="#DC2626" />
            <Text style={s.pagoTexto}>{erro}</Text>
            <TouchableOpacity style={[s.cta, { alignSelf: 'stretch' }]} onPress={gerar}>
              <Text style={s.ctaTxt}>Tentar de novo</Text>
            </TouchableOpacity>
          </View>
        ) : !dados?.pix ? (
          <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: 60 }} />
        ) : (
          <ScrollView contentContainerStyle={{ alignItems: 'center', paddingTop: 8 }}>
            <Text style={s.pixValor}>{brl(dados.totalPrice)}</Text>
            <Text style={s.pixSub}>{dados.days} dias na vitrine</Text>
            {dados.pix.qrBase64 ? (
              <Image source={{ uri: `data:image/png;base64,${dados.pix.qrBase64}` }} style={s.qr} />
            ) : null}
            <TouchableOpacity style={s.copiar} onPress={copiar} activeOpacity={0.85}>
              <Ionicons name="copy-outline" size={17} color={colors.primary} />
              <Text style={s.copiarTxt}>Copiar código PIX</Text>
            </TouchableOpacity>
            <Text style={s.pixValidade}>Código válido até {new Date(dados.pix.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Venceu? Feche e toque em pagar de novo.</Text>

            {previsto && (
              <View style={s.previsao}>
                <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                <Text style={s.previsaoTxt}>
                  {entraAgora
                    ? 'Pagando agora, o anúncio entra no ar na hora.'
                    : `A vitrine está cheia: pagando agora, entra em ${dataCurta(previsto)}.`}
                </Text>
              </View>
            )}
            <View style={s.aguardando}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={s.aguardandoTxt}>Aguardando o pagamento…</Text>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF8F3' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  icone: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 17, fontWeight: '900', color: TEXT },

  cartao: { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  arte: { width: '100%', aspectRatio: 3, backgroundColor: colors.primaryLight },
  corpo: { padding: 14, gap: 10 },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pilula: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  pilulaTxt: { fontSize: 11.5, fontWeight: '800' },
  valor: { fontSize: 12.5, fontWeight: '700', color: MUTED },
  texto: { fontSize: 13.5, color: TEXT, lineHeight: 19 },
  forte: { fontWeight: '800' },

  metricas: { flexDirection: 'row', gap: 8 },
  metrica: { flex: 1, backgroundColor: colors.primaryLight, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  metricaValor: { fontSize: 17, fontWeight: '900', color: colors.primary, fontVariant: ['tabular-nums'] },
  metricaRotulo: { fontSize: 10.5, fontWeight: '700', color: MUTED, marginTop: 1 },

  acoes: { flexDirection: 'row', gap: 8 },
  cta: {
    flexDirection: 'row', gap: 7, backgroundColor: colors.primary, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
  },
  ctaTxt: { color: '#fff', fontSize: 14, fontWeight: '900' },
  secundario: {
    flexDirection: 'row', gap: 6, borderRadius: 12, borderWidth: 1.5, borderColor: '#FFD9C2',
    paddingHorizontal: 14, paddingVertical: 11, alignItems: 'center', justifyContent: 'center',
  },
  secundarioTxt: { color: colors.primary, fontSize: 13.5, fontWeight: '800' },

  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  vazioIcone: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  vazioTitulo: { fontSize: 18, fontWeight: '900', color: TEXT },
  vazioTexto: { fontSize: 13.5, color: MUTED, textAlign: 'center', lineHeight: 19, marginBottom: 8 },

  modal: { flex: 1, backgroundColor: '#FFF8F3', paddingHorizontal: 20 },
  modalTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18 },
  modalTitulo: { fontSize: 18, fontWeight: '900', color: TEXT },
  pixValor: { fontSize: 30, fontWeight: '900', color: TEXT, letterSpacing: -0.5 },
  pixSub: { fontSize: 13, color: MUTED, fontWeight: '600', marginBottom: 14 },
  qr: { width: 210, height: 210, marginBottom: 14, borderRadius: 8, backgroundColor: '#fff' },
  copiar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', justifyContent: 'center',
    backgroundColor: colors.primaryLight, borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: '#FFD9C2',
  },
  copiarTxt: { fontSize: 15, fontWeight: '900', color: colors.primary },
  pixValidade: { fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 10, lineHeight: 17 },
  previsao: {
    flexDirection: 'row', gap: 8, alignItems: 'center', alignSelf: 'stretch',
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginTop: 16, borderWidth: 1, borderColor: BORDER,
  },
  previsaoTxt: { flex: 1, fontSize: 13, color: TEXT, lineHeight: 18 },
  aguardando: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  aguardandoTxt: { fontSize: 13, color: MUTED, fontWeight: '600' },
  pagoBox: { alignItems: 'center', gap: 12, paddingTop: 40 },
  pagoIcone: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' },
  pagoTitulo: { fontSize: 20, fontWeight: '900', color: TEXT },
  pagoTexto: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
})
