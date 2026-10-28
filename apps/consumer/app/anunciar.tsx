import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image,
  ActivityIndicator, KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../src/api/client'
import { uploadImageAsset } from '../src/api/upload'
import { colors } from '../src/theme/colors'
import { useAuthStore } from '../src/stores/auth.store'
import { useToast } from '../src/components/Toast'
import { LoadError } from '../src/components/LoadError'
import { formatPhoneBR } from '../src/utils/phone'
import { AdConfig, AdLinkType, MyAd, brl, dataCurta } from '../src/utils/ads'

const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const BORDER = '#F0E8E0'

const { width: SCREEN_W } = Dimensions.get('window')
const PREVIEW_W = SCREEN_W - 32
const PREVIEW_H = Math.round(PREVIEW_W / 3)

/** Máscara de CPF (11) ou CNPJ (14) conforme a quantidade de dígitos. */
function mascaraDocumento(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}

export default function AnunciarScreen() {
  const insets = useSafeAreaInsets()
  const { show: toast } = useToast()
  const user = useAuthStore((s) => s.user)
  const { de } = useLocalSearchParams<{ de?: string }>() // "anunciar de novo" a partir de um anúncio
  const temLoja = user?.role === 'STORE_OWNER'

  const [config, setConfig] = useState<AdConfig | null>(null)
  const [erroConfig, setErroConfig] = useState(false)
  const [arte, setArte] = useState<{ url: string; proporcao: number } | null>(null)
  const [enviandoArte, setEnviandoArte] = useState(false)
  const [dias, setDias] = useState(7)
  const [destino, setDestino] = useState<AdLinkType>(temLoja ? 'STORE' : 'WHATSAPP')
  const [alvo, setAlvo] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [documento, setDocumento] = useState('')
  const [enviando, setEnviando] = useState(false)

  function carregar() {
    setErroConfig(false)
    api.get<AdConfig>('/ads/config')
      .then((r) => { setConfig(r.data); setDias((d) => Math.max(d, r.data.minDays)) })
      .catch(() => setErroConfig(true))
  }
  useEffect(() => { carregar() }, [])

  // Renovação: reaproveita arte, destino e dados do anúncio anterior.
  useEffect(() => {
    if (!de || !user) return
    api.get<MyAd>(`/ads/mine/${de}`).then(({ data: a }) => {
      setArte({ url: a.imageUrl, proporcao: 3 })
      setEmpresa(a.companyName)
      setDocumento(mascaraDocumento(a.document))
      setDias(a.days)
      setDestino(a.linkType === 'STORE' && !temLoja ? 'NONE' : a.linkType)
      setAlvo(a.linkType === 'WHATSAPP' && a.linkTarget ? formatPhoneBR(a.linkTarget.replace(/^55/, '')) : a.linkTarget ?? '')
    }).catch(() => {})
  }, [de, user?.id])

  const total = config ? Math.round(config.pricePerDay * dias * 100) / 100 : 0
  const vitrineCheia = config ? new Date(config.nextStart).getTime() - Date.now() > 60 * 60 * 1000 : false

  async function escolherArte() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { toast('Permita acesso à galeria nas configurações.', 'error'); return }
    // SEM allowsEditing: o corte do expo-image-picker trava no Android real. O
    // servidor enquadra a arte em 3:1 sozinho.
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.95 })
    if (r.canceled) return
    const asset = r.assets?.[0]
    if (!asset?.uri) { toast('Não consegui ler a imagem. Tente outra.', 'error'); return }
    setEnviandoArte(true)
    try {
      const url = await uploadImageAsset(asset.uri, { name: 'anuncio.jpg' })
      setArte({ url, proporcao: asset.width && asset.height ? asset.width / asset.height : 3 })
    } catch (e: any) {
      toast(e?.message ?? 'Não foi possível enviar a arte.', 'error')
    } finally {
      setEnviandoArte(false)
    }
  }

  const faltando = useMemo(() => {
    if (!arte) return 'Escolha a arte do anúncio'
    if ((destino === 'WHATSAPP' || destino === 'URL') && !alvo.trim()) {
      return destino === 'WHATSAPP' ? 'Informe o WhatsApp' : 'Informe o link'
    }
    if (empresa.trim().length < 2) return 'Informe o nome da empresa'
    const d = documento.replace(/\D/g, '')
    if (d.length !== 11 && d.length !== 14) return 'Informe o CPF ou CNPJ'
    return null
  }, [arte, destino, alvo, empresa, documento])

  async function enviar() {
    if (faltando || !arte || enviando) return
    setEnviando(true)
    try {
      await api.post('/ads', {
        companyName: empresa.trim(),
        document: documento,
        imageUrl: arte.url,
        days: dias,
        linkType: destino,
        linkTarget: destino === 'URL' ? alvo.trim() : destino === 'WHATSAPP' ? alvo : undefined,
      })
      toast('Recebemos seu anúncio! Avisamos assim que for aprovado.', 'success')
      router.replace('/meus-anuncios' as any)
    } catch (e: any) {
      const m = e?.response?.data?.message
      toast(Array.isArray(m) ? m.join(', ') : m ?? 'Não foi possível enviar agora.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  if (!user) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <Cabecalho />
        <View style={s.vazio}>
          <Ionicons name="megaphone-outline" size={40} color={colors.primary} />
          <Text style={s.vazioTitulo}>Entre para anunciar</Text>
          <Text style={s.vazioTexto}>O anúncio fica ligado à sua conta: é por ela que você acompanha a aprovação, paga e vê os resultados.</Text>
          <TouchableOpacity style={s.cta} onPress={() => router.push('/(auth)/login')} activeOpacity={0.85}>
            <Text style={s.ctaTxt}>Entrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={[s.root, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Cabecalho />
      {erroConfig ? (
        <LoadError onRetry={carregar} sub="Não conseguimos carregar os preços. Verifique a conexão." />
      ) : !config ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} size="large" />
      ) : (
        <ScrollView contentContainerStyle={[s.conteudo, { paddingBottom: insets.bottom + 120 }]} keyboardShouldPersistTaps="handled">
          <Text style={s.intro}>
            Sua arte gira no topo da tela inicial, para todo mundo que abre o app. Você só paga depois que a gente aprovar.
          </Text>

          {/* Arte */}
          <Text style={s.rotulo}>ARTE DO ANÚNCIO</Text>
          <TouchableOpacity style={s.preview} onPress={escolherArte} activeOpacity={0.85} disabled={enviandoArte}>
            {arte ? (
              <PreviaArte url={arte.url} proporcao={arte.proporcao} />
            ) : (
              <View style={s.previewVazio}>
                <Ionicons name="image-outline" size={26} color={colors.primary} />
                <Text style={s.previewVazioTitulo}>Escolher arte</Text>
                <Text style={s.previewVazioSub}>Ideal: 1200 × 400 px, horizontal</Text>
              </View>
            )}
            {enviandoArte && (
              <View style={s.previewCarregando}><ActivityIndicator color="#fff" /></View>
            )}
          </TouchableOpacity>
          {arte && (
            <TouchableOpacity onPress={escolherArte} hitSlop={8} style={s.trocar}>
              <Ionicons name="swap-horizontal" size={14} color={colors.primary} />
              <Text style={s.trocarTxt}>Trocar arte</Text>
            </TouchableOpacity>
          )}
          <Text style={s.dica}>
            Pouco texto e letra grande: o card aparece pequeno no celular. Imagem quadrada também serve — ela vai inteira no meio.
          </Text>

          {/* Dias */}
          <Text style={s.rotulo}>QUANTOS DIAS</Text>
          <View style={s.cartao}>
            <View style={s.diasLinha}>
              <TouchableOpacity
                style={[s.passo, dias <= config.minDays && s.passoOff]}
                onPress={() => setDias((d) => Math.max(config.minDays, d - 1))}
                disabled={dias <= config.minDays}
              >
                <Ionicons name="remove" size={20} color={dias <= config.minDays ? '#C9B8AC' : colors.primary} />
              </TouchableOpacity>
              <View style={{ alignItems: 'center' }}>
                <Text style={s.diasNum}>{dias}</Text>
                <Text style={s.diasUn}>dias</Text>
              </View>
              <TouchableOpacity
                style={[s.passo, dias >= config.maxDays && s.passoOff]}
                onPress={() => setDias((d) => Math.min(config.maxDays, d + 1))}
                disabled={dias >= config.maxDays}
              >
                <Ionicons name="add" size={20} color={dias >= config.maxDays ? '#C9B8AC' : colors.primary} />
              </TouchableOpacity>
            </View>
            <View style={s.atalhos}>
              {[7, 15, 30].filter((n) => n >= config.minDays && n <= config.maxDays).map((n) => (
                <TouchableOpacity key={n} style={[s.atalho, dias === n && s.atalhoOn]} onPress={() => setDias(n)}>
                  <Text style={[s.atalhoTxt, dias === n && s.atalhoTxtOn]}>{n} dias</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.conta}>
              <Text style={s.contaTxt}>{brl(config.pricePerDay)} por dia × {dias}</Text>
              <Text style={s.contaTotal}>{brl(total)}</Text>
            </View>
          </View>

          {/* Destino */}
          <Text style={s.rotulo}>QUEM TOCAR NO ANÚNCIO VAI PARA</Text>
          <View style={s.opcoes}>
            {([
              ...(temLoja ? [['STORE', 'storefront-outline', 'Minha loja']] : []),
              ['WHATSAPP', 'logo-whatsapp', 'WhatsApp'],
              ['URL', 'globe-outline', 'Site'],
              ['NONE', 'eye-outline', 'Só exibir'],
            ] as [AdLinkType, any, string][]).map(([v, icone, label]) => (
              <TouchableOpacity key={v} style={[s.opcao, destino === v && s.opcaoOn]} onPress={() => { setDestino(v); setAlvo('') }}>
                <Ionicons name={icone} size={16} color={destino === v ? '#fff' : MUTED} />
                <Text style={[s.opcaoTxt, destino === v && s.opcaoTxtOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {destino === 'WHATSAPP' && (
            <TextInput
              style={s.input} placeholder="(69) 99999-9999" placeholderTextColor="#BBA898"
              keyboardType="phone-pad" value={alvo} onChangeText={(t) => setAlvo(formatPhoneBR(t))}
            />
          )}
          {destino === 'URL' && (
            <TextInput
              style={s.input} placeholder="https://seusite.com.br" placeholderTextColor="#BBA898"
              autoCapitalize="none" keyboardType="url" value={alvo} onChangeText={setAlvo}
            />
          )}

          {/* Nota fiscal */}
          <Text style={s.rotulo}>DADOS PARA A NOTA FISCAL</Text>
          <TextInput
            style={s.input} placeholder="Nome da empresa" placeholderTextColor="#BBA898"
            value={empresa} onChangeText={setEmpresa} maxLength={80}
          />
          <TextInput
            style={[s.input, { marginTop: 10 }]} placeholder="CNPJ ou CPF" placeholderTextColor="#BBA898"
            keyboardType="number-pad" value={documento} onChangeText={(t) => setDocumento(mascaraDocumento(t))}
          />

          {/* Como funciona daqui pra frente */}
          <View style={s.passos}>
            <Passo icone="time-outline" texto="A equipe do Tá Barato confere a arte, normalmente no mesmo dia." />
            <Passo icone="qr-code-outline" texto={`Aprovado, você paga o PIX em até ${config.payDeadlineDays} dias.`} />
            <Passo
              icone="rocket-outline"
              texto={vitrineCheia
                ? `A vitrine está cheia agora: a próxima vaga abre em ${dataCurta(config.nextStart)}. Seu anúncio entra assim que abrir.`
                : 'Pagou, entrou no ar na hora — sem esperar ninguém.'}
            />
          </View>
        </ScrollView>
      )}

      {config && (
        <View style={[s.rodape, { paddingBottom: insets.bottom + 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.rodapeTotal}>{brl(total)}</Text>
            <Text style={s.rodapeSub}>{faltando ?? 'Só cobra depois de aprovado'}</Text>
          </View>
          <TouchableOpacity
            style={[s.cta, (faltando || enviando) && { opacity: 0.5 }]}
            onPress={enviar} disabled={!!faltando || enviando} activeOpacity={0.85}
          >
            {enviando ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaTxt}>Enviar para aprovação</Text>}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

function Cabecalho() {
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={() => router.back()} style={s.voltar}>
        <Ionicons name="arrow-back" size={22} color={TEXT} />
      </TouchableOpacity>
      <Text style={s.titulo}>Anunciar na vitrine</Text>
      <TouchableOpacity onPress={() => router.push('/meus-anuncios' as any)} style={s.voltar}>
        <Ionicons name="albums-outline" size={21} color={TEXT} />
      </TouchableOpacity>
    </View>
  )
}

/** Mostra a arte como vai ficar: perto de 3:1 preenche; senão, inteira sobre fundo desfocado. */
function PreviaArte({ url, proporcao }: { url: string; proporcao: number }) {
  const preenche = proporcao >= 2.2 && proporcao <= 4
  return (
    <View style={{ width: '100%', height: '100%' }}>
      {preenche ? (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <>
          <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={18} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} />
          <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        </>
      )}
      <View style={s.selo}><Text style={s.seloTxt}>Patrocinado</Text></View>
    </View>
  )
}

function Passo({ icone, texto }: { icone: any; texto: string }) {
  return (
    <View style={s.passoLinha}>
      <View style={s.passoIcone}><Ionicons name={icone} size={16} color={colors.primary} /></View>
      <Text style={s.passoTxt}>{texto}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF8F3' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  voltar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 17, fontWeight: '900', color: TEXT },
  conteudo: { paddingHorizontal: 16 },
  intro: { fontSize: 14, color: MUTED, lineHeight: 20, marginBottom: 18 },

  rotulo: { fontSize: 11, fontWeight: '800', color: MUTED, letterSpacing: 0.8, marginTop: 18, marginBottom: 8 },

  preview: {
    width: PREVIEW_W, height: PREVIEW_H, borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#FFD9C2', borderStyle: 'dashed',
  },
  previewVazio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  previewVazioTitulo: { fontSize: 14, fontWeight: '800', color: colors.primary, marginTop: 4 },
  previewVazioSub: { fontSize: 11.5, color: MUTED },
  previewCarregando: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26,10,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  selo: {
    position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(26,10,0,0.55)',
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  seloTxt: { color: '#fff', fontSize: 9.5, fontWeight: '700', letterSpacing: 0.3 },
  trocar: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8 },
  trocarTxt: { fontSize: 13, fontWeight: '800', color: colors.primary },
  dica: { fontSize: 12, color: MUTED, lineHeight: 17, marginTop: 8 },

  cartao: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER },
  diasLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  passo: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  passoOff: { backgroundColor: '#F6F0EB' },
  diasNum: { fontSize: 34, fontWeight: '900', color: TEXT, letterSpacing: -1 },
  diasUn: { fontSize: 12, fontWeight: '700', color: MUTED, marginTop: -4 },
  atalhos: { flexDirection: 'row', gap: 8, marginTop: 14, justifyContent: 'center' },
  atalho: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: BORDER },
  atalhoOn: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  atalhoTxt: { fontSize: 12.5, fontWeight: '700', color: MUTED },
  atalhoTxtOn: { color: colors.primary },
  conta: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER,
  },
  contaTxt: { fontSize: 13, color: MUTED, fontWeight: '600' },
  contaTotal: { fontSize: 18, fontWeight: '900', color: colors.primary },

  opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opcao: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12,
    backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER,
  },
  opcaoOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  opcaoTxt: { fontSize: 13, fontWeight: '700', color: MUTED },
  opcaoTxtOn: { color: '#fff' },
  input: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: TEXT, marginTop: 10,
  },

  passos: { marginTop: 24, gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER },
  passoLinha: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  passoIcone: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  passoTxt: { flex: 1, fontSize: 13, color: TEXT, lineHeight: 18, paddingTop: 5 },

  rodape: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  rodapeTotal: { fontSize: 18, fontWeight: '900', color: TEXT },
  rodapeSub: { fontSize: 11.5, color: MUTED, marginTop: 1 },
  cta: {
    backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', minWidth: 120,
  },
  ctaTxt: { color: '#fff', fontSize: 14.5, fontWeight: '900' },

  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  vazioTitulo: { fontSize: 18, fontWeight: '900', color: TEXT },
  vazioTexto: { fontSize: 13.5, color: MUTED, textAlign: 'center', lineHeight: 19, marginBottom: 8 },
})
