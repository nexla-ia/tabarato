import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Linking, Modal, Platform, Dimensions, TextInput,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import * as ImagePicker from 'expo-image-picker'
import * as SecureStore from 'expo-secure-store'
import { api } from '../../src/api/client'
import { uploadDocumentImage } from '../../src/api/upload'
import { getDeliverySocket } from '../../src/socket'
import { startCourierLocationUpdates, stopCourierLocationUpdates } from '../../src/tasks/locationTask'
import { useToast } from '../../src/components/Toast'
import { useAuthStore } from '../../src/stores/auth.store'

const PRIMARY      = '#FF5500'
const PRIMARY_LIGHT = '#FFF3EB'
const TEXT         = '#1A0A00'
const MUTED        = '#7A5C4A'
const BG           = '#FFFBF7'
const CARD         = '#FFFFFF'
const BORDER       = '#F0E8E0'
const GREEN        = '#22C55E'
const AMBER        = '#F59E0B'
const RED          = '#EF4444'

const { height: SCREEN_H } = Dimensions.get('window')

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

function openMaps(lat: number, lng: number, label: string) {
  const encoded = encodeURIComponent(label)
  const native = Platform.OS === 'ios'
    ? `maps:?daddr=${lat},${lng}`
    : `geo:${lat},${lng}?q=${lat},${lng}(${encoded})`
  const web = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  // No Android, esquemas geo:/maps: podem rejeitar (não declarados em <queries>) →
  // sem catch vira unhandled rejection. Cai pro link web e engole qualquer falha.
  Linking.canOpenURL(native)
    .then(can => Linking.openURL(can ? native : web))
    .catch(() => Linking.openURL(web).catch(() => {}))
}

interface CourierProfile {
  id: string
  isOnline: boolean
  status: string
  currentLat?: number
  currentLng?: number
  cnhStatus?: string | null
  identityStatus?: string | null
  vehicleDocStatus?: string | null
  user: { name: string; phone: string }
}

interface Delivery {
  id: string
  status: string
  courierFee: number
  distanceKm: number
  order: {
    id: string
    total: number
    store: { name: string; lat: number; lng: number }
    address: { street: string; number: string; district: string; lat: number; lng: number }
  }
}

type MyLocation = { lat: number; lng: number }

const STATUS_META: Record<string, { label: string; color: string; icon: IoniconName; dest?: 'store' | 'client' }> = {
  COURIER_ASSIGNED:         { label: 'Atribuída a você',       color: AMBER,   icon: 'time-outline', dest: 'store' },
  COURIER_HEADING_TO_STORE: { label: 'Indo à loja',            color: PRIMARY, icon: 'navigate-outline', dest: 'store' },
  COURIER_AT_STORE:         { label: 'Na loja',                color: PRIMARY, icon: 'location-outline', dest: 'store' },
  PICKED_UP:                { label: 'Coletado',               color: GREEN,   icon: 'bag-check-outline', dest: 'client' },
  HEADING_TO_CLIENT:        { label: 'Indo ao cliente',        color: GREEN,   icon: 'bicycle-outline', dest: 'client' },
  DELIVERED:                { label: 'Entregue',               color: GREEN,   icon: 'checkmark-circle-outline' },
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CourierHomeScreen() {
  const insets = useSafeAreaInsets()
  const { user } = useAuthStore()
  const { show: toast } = useToast()

  const [profile, setProfile]           = useState<CourierProfile | null>(null)
  const [deliveries, setDeliveries]     = useState<Delivery[]>([])
  const [available, setAvailable]       = useState<Delivery[]>([])
  const [myLocation, setMyLocation]     = useState<MyLocation | null>(null)
  const [pendingDelivery, setPending]   = useState<Delivery | null>(null)
  const [stats, setStats]               = useState<{ todayCount: number; todayEarnings: number; rating: number } | null>(null)
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)
  const [togglingOnline, setToggling]   = useState(false)
  const [notRegistered, setNoReg]       = useState(false)
  const [actioning, setActioning]       = useState<'accept' | null>(null)
  const [advancingId, setAdvancingId]   = useState<string | null>(null)
  const [codeModal, setCodeModal]       = useState<{ deliveryId: string } | null>(null)
  const [codeInput, setCodeInput]       = useState('')
  const [resubmitting, setResubmitting] = useState<string | null>(null)

  // Entregas que o entregador JÁ resolveu (recusou OU aceitou) — não reoferecer no
  // modal. Sem isso, uma entrega aceita que ainda apareça em "available" no próximo
  // poll voltava a virar `pending` e o modal reaparecia pra mesma corrida.
  const dismissedIds = useRef(new Set<string>())

  const applyAvailable = useCallback((dels: Delivery[]) => {
    setAvailable(dels)
    const fresh = dels.filter(d => !dismissedIds.current.has(d.id))
    setPending(prev => prev ?? fresh[0] ?? null)
  }, [])

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const { data } = await api.get('/couriers/me')
      setProfile(data)
      setNoReg(false)
      if (data.status === 'APPROVED') {
        const [{ data: myDels }, { data: avail }, { data: st }] = await Promise.all([
          api.get('/couriers/me/deliveries'),
          api.get('/couriers/me/available-deliveries'),
          api.get('/couriers/me/stats').catch(() => ({ data: null })),
        ])
        setDeliveries(myDels)
        applyAvailable(avail)
        if (st) setStats(st)
      }
    } catch (err: any) {
      if (err.response?.status === 404) setNoReg(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [applyAvailable])

  useEffect(() => { fetchData() }, [fetchData])

  // Location permission + background tracking
  useEffect(() => {
    if (profile?.status !== 'APPROVED') return
    let sub: Location.LocationSubscription | null = null
    // Flag anti-vazamento: se o efeito for limpo ENQUANTO o watchPositionAsync ainda
    // está resolvendo (1-2s), o cleanup via `sub` ainda seria null e a subscription
    // criada logo depois ficaria órfã (PATCH de localização eterno + bateria).
    let cancelled = false

    ;(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        toast('Ative a localização para receber e navegar nas entregas.', 'error')
        return
      }
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        const pos: MyLocation = { lat: loc.coords.latitude, lng: loc.coords.longitude }
        setMyLocation(pos)
        try { await api.patch('/couriers/me/location', { lat: pos.lat, lng: pos.lng }) } catch {}
      } catch {
        // Location services disabled or unavailable — app still works without GPS
      }

      const s = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 30, timeInterval: 20_000 },
        async ({ coords }) => {
          const p: MyLocation = { lat: coords.latitude, lng: coords.longitude }
          setMyLocation(p)
          try { await api.patch('/couriers/me/location', { lat: p.lat, lng: p.lng }) } catch {}
        },
      ).catch(() => null)
      // Desmontou durante o await → remove imediatamente, senão fica órfã.
      if (cancelled) { s?.remove(); return }
      sub = s
    })()

    return () => { cancelled = true; sub?.remove() }
  }, [profile?.status])

  // Rastreamento em SEGUNDO PLANO enquanto ONLINE: mantém a posição chegando mesmo
  // com o app minimizado/tela apagada (o watch de foreground acima só roda com o app
  // aberto). Ao ficar offline, desliga (e some a notificação de serviço).
  useEffect(() => {
    if (profile?.status !== 'APPROVED') return
    if (profile.isOnline) {
      ;(async () => {
        try {
          const fg = await Location.getForegroundPermissionsAsync()
          if (fg.granted) await Location.requestBackgroundPermissionsAsync().catch(() => null)
          await startCourierLocationUpdates()
        } catch {
          // Sem permissão "sempre" → segue só com o foreground watch (degrada suave).
        }
      })()
    } else {
      stopCourierLocationUpdates().catch(() => {})
    }
  }, [profile?.status, profile?.isOnline])

  // Poll while PENDING → detect admin approval
  useEffect(() => {
    if (profile?.status !== 'PENDING') return
    const id = setInterval(() => fetchData(true), 20_000)
    return () => clearInterval(id)
  }, [profile?.status, fetchData])

  // Oferta em TEMPO REAL: entra na sala do entregador e, ao receber "delivery:new",
  // re-busca na hora (sem esperar o poll de 15s abaixo, que fica de fallback).
  useEffect(() => {
    if (profile?.status !== 'APPROVED') return
    let socket: ReturnType<typeof getDeliverySocket> | undefined
    let cancelled = false
    const onConnect = () => socket?.emit('courier:subscribe')
    const onNew = () => { fetchData(true) }
    ;(async () => {
      const token = await SecureStore.getItemAsync('access_token')
      if (!token || cancelled) return
      socket = getDeliverySocket(token)
      onConnect() // já conectado → inscreve agora
      socket.on('connect', onConnect) // reconectou → re-inscreve
      socket.on('delivery:new', onNew)
    })()
    return () => {
      cancelled = true
      socket?.off('connect', onConnect)
      socket?.off('delivery:new', onNew)
    }
  }, [profile?.status, fetchData])

  // Poll deliveries every 15s when APPROVED
  useEffect(() => {
    if (profile?.status !== 'APPROVED') return
    const id = setInterval(async () => {
      try {
        const [{ data: myDels }, { data: avail }] = await Promise.all([
          api.get('/couriers/me/deliveries'),
          api.get('/couriers/me/available-deliveries'),
        ])
        setDeliveries(myDels)
        applyAvailable(avail)
      } catch {}
    }, 15_000)
    return () => clearInterval(id)
  }, [profile?.status, applyAvailable])

  // Reenvio de documento reprovado: escolhe foto da galeria, sobe pro bucket privado
  // e chama a rota de reenvio (a conta volta pra análise → tela PENDING).
  async function handleResubmit(document: 'cnh' | 'identity' | 'vehicle', label: string) {
    if (resubmitting) return
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        toast('Permita o acesso à galeria para reenviar o documento.', 'error')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85,
      })
      if (result.canceled) return
      const uri = result.assets?.[0]?.uri
      if (!uri) { toast('Não consegui ler a imagem. Tente outra.', 'error'); return }

      setResubmitting(document)
      const path = await uploadDocumentImage(uri, { name: `${document}.jpg` })
      await api.patch('/couriers/me/documents', { document, url: path })
      toast(`${label} reenviado! Seu cadastro voltou para análise.`, 'success')
      fetchData(true)
    } catch (e: any) {
      toast(e?.response?.data?.message ?? e?.message ?? 'Não foi possível reenviar o documento.', 'error')
    } finally {
      setResubmitting(null)
    }
  }

  async function handleToggleOnline() {
    if (!profile) return
    setToggling(true)
    try {
      const { data } = await api.patch('/couriers/me/toggle-online')
      setProfile(p => p ? { ...p, isOnline: data.isOnline } : p)
    } catch {
      toast('Não foi possível atualizar o status.', 'error')
    } finally {
      setToggling(false)
    }
  }

  async function handleAccept() {
    if (!pendingDelivery) return
    // Marca como resolvida ANTES do await: se o poll rodar durante o accept, não
    // reoferece essa mesma entrega no modal.
    dismissedIds.current.add(pendingDelivery.id)
    setActioning('accept')
    try {
      await api.patch(`/couriers/me/deliveries/${pendingDelivery.id}/accept`)
      const d = pendingDelivery
      setPending(null)
      fetchData(true)
      Alert.alert(
        'Entrega aceita!',
        `Vá até a loja "${d.order.store.name}" para coletar o pedido.`,
        [
          { text: 'Abrir rota para loja', onPress: () => openMaps(d.order.store.lat, d.order.store.lng, d.order.store.name) },
          { text: 'OK', style: 'cancel' },
        ],
      )
    } catch (err: any) {
      const status = err.response?.status
      const msg = err.response?.data?.message
      // 409 = corrida já tomada OU o entregador já tem uma entrega ativa → MANTÉM
      // dispensada (não fica reaparecendo em loop). Erro de rede/outro → libera pra
      // o próximo poll poder reofertar (a cobrança não passou).
      if (status !== 409) dismissedIds.current.delete(pendingDelivery.id)
      toast(
        (Array.isArray(msg) ? msg.join(', ') : msg)
          || (status === 409 ? 'Essa corrida não está mais disponível.' : 'Falha ao aceitar. Tente novamente.'),
        'error',
      )
      setPending(null)
      fetchData(true)
    } finally {
      setActioning(null)
    }
  }

  function handleReject() {
    if (!pendingDelivery) return
    const id = pendingDelivery.id
    dismissedIds.current.add(id)
    // Registra a recusa no servidor — assim essa corrida NÃO é ofertada de novo pra
    // este entregador (antes só sumia do app e voltava no próximo ciclo de matching).
    api.patch(`/couriers/me/deliveries/${id}/refuse`).catch(() => {})
    const next = available.find(d => !dismissedIds.current.has(d.id))
    setPending(next ?? null)
  }

  async function handleAdvance(deliveryId: string, currentStatus: string) {
    // Só a etapa final (HEADING_TO_CLIENT → DELIVERED) pede o código do cliente.
    // "Saí para entrega" (PICKED_UP → HEADING_TO_CLIENT) é só um avanço de status.
    const isDelivering = currentStatus === 'HEADING_TO_CLIENT'

    if (isDelivering) {
      // Finalizar exige o código de 6 dígitos que o cliente informa (anti-fraude).
      setCodeInput('')
      setCodeModal({ deliveryId })
    } else {
      doAdvance(deliveryId)
    }
  }

  async function confirmDeliveryWithCode() {
    if (!codeModal || advancingId) return // já em andamento → ignora toque duplo
    const code = codeInput.trim()
    if (!/^\d{6}$/.test(code)) {
      toast('Código inválido — peça ao cliente os 6 dígitos que aparecem no app dele.', 'error')
      return
    }
    // Desabilita o botão JÁ (antes do GPS, que pode demorar) — sem isso o entregador
    // tocava de novo achando que travou e disparava várias chamadas concorrentes.
    setAdvancingId(codeModal.deliveryId)
    // GPS fresco no momento da confirmação (cerca geográfica anti-fraude).
    // Re-solicita a permissão aqui caso o entregador tenha negado antes — senão
    // ficaria travado sem conseguir finalizar, com erro genérico.
    let coords: { lat: number; lng: number } | undefined = myLocation ?? undefined
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      }
    } catch { /* usa a última conhecida, se houver */ }
    const ok = await doAdvance(codeModal.deliveryId, undefined, code, coords)
    if (ok) {
      setCodeModal(null)
      setCodeInput('')
    }
  }

  async function doAdvance(deliveryId: string, photoUrl?: string, code?: string, coords?: { lat: number; lng: number }): Promise<boolean> {
    setAdvancingId(deliveryId)
    try {
      await api.patch(`/couriers/me/deliveries/${deliveryId}/advance`, { photoUrl, code, lat: coords?.lat, lng: coords?.lng })
      await fetchData(true)
      return true
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Não foi possível avançar o status.', 'error')
      return false
    } finally {
      setAdvancingId(null)
    }
  }

  function handleReturn(deliveryId: string) {
    Alert.alert(
      'Devolver entrega',
      'Tem certeza? O pedido voltará para a fila e outro entregador poderá aceitá-lo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Devolver',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.patch(`/couriers/me/deliveries/${deliveryId}/return`)
              fetchData(true)
            } catch (err: any) {
              toast(err.response?.data?.message ?? 'Não foi possível devolver a entrega.', 'error')
            }
          },
        },
      ],
    )
  }

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={PRIMARY} size="large" />
      </View>
    )
  }

  const firstName = user?.name?.split(' ')[0] ?? 'Entregador'

  // ── PENDING ────────────────────────────────────────────────────────────────
  if (profile?.status === 'PENDING') {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(tabs)')} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={20} color={TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Modo Entregador</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.center}>
          <View style={[styles.emptyIconWrap, { backgroundColor: PRIMARY_LIGHT }]}>
            <Ionicons name="time-outline" size={48} color={PRIMARY} />
          </View>
          <Text style={styles.emptyTitle}>Cadastro em análise</Text>
          <Text style={styles.emptySub}>
            Nossa equipe está analisando seus documentos. Você receberá uma notificação assim que sua conta for aprovada.
          </Text>
          <View style={pendingCard.box}>
            {([
              { icon: 'document-text-outline' as IoniconName, text: 'Documentos enviados com sucesso' },
              { icon: 'time-outline'          as IoniconName, text: 'Prazo de análise: até 24h' },
              { icon: 'notifications-outline' as IoniconName, text: 'Você será notificado quando aprovado' },
            ] as const).map(item => (
              <View key={item.text} style={pendingCard.row}>
                <View style={pendingCard.iconWrap}>
                  <Ionicons name={item.icon} size={16} color={PRIMARY} />
                </View>
                <Text style={pendingCard.text}>{item.text}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={[styles.outlineBtn, { marginBottom: 10 }]} onPress={() => fetchData()} activeOpacity={0.85}>
            <Ionicons name="refresh-outline" size={16} color={PRIMARY} />
            <Text style={styles.outlineBtnText}>Verificar status agora</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.outlineBtn} onPress={() => router.replace('/(tabs)')} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={16} color={PRIMARY} />
            <Text style={styles.outlineBtnText}>Voltar à seleção de modo</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── REJECTED / SUSPENDED ──────────────────────────────────────────────────
  if (profile?.status === 'REJECTED' || profile?.status === 'SUSPENDED') {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(tabs)')} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={20} color={TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Modo Entregador</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.center}>
          <View style={[styles.emptyIconWrap, { backgroundColor: '#FEF2F2' }]}>
            <Ionicons name="close-circle-outline" size={48} color={RED} />
          </View>
          <Text style={[styles.emptyTitle, { color: RED }]}>
            {profile.status === 'SUSPENDED' ? 'Conta suspensa' : 'Cadastro não aprovado'}
          </Text>
          <Text style={styles.emptySub}>
            {profile.status === 'SUSPENDED'
              ? 'Sua conta foi suspensa. Entre em contato com o suporte para mais informações.'
              : 'Um ou mais documentos foram reprovados. Reenvie os marcados abaixo para uma nova análise.'}
          </Text>

          {/* Reenvio de documentos reprovados (só REJECTED; suspensão é outro caso). */}
          {profile.status === 'REJECTED' && (
            <View style={{ width: '100%', gap: 8, marginBottom: 16 }}>
              {([
                { key: 'cnh' as const,      label: 'CNH',              status: profile.cnhStatus },
                { key: 'identity' as const, label: 'Identidade',       status: profile.identityStatus },
                { key: 'vehicle' as const,  label: 'Doc. do veículo',  status: profile.vehicleDocStatus },
              ]).filter(d => d.status === 'REJECTED').map(d => (
                <TouchableOpacity
                  key={d.key}
                  style={[styles.primaryBtn, resubmitting !== null && { opacity: 0.6 }]}
                  onPress={() => handleResubmit(d.key, d.label)}
                  disabled={resubmitting !== null}
                  activeOpacity={0.85}
                >
                  {resubmitting === d.key ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                      <Text style={styles.primaryBtnText}>Reenviar {d.label}</Text>
                    </>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.outlineBtn} onPress={() => router.replace('/(tabs)')} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={16} color={PRIMARY} />
            <Text style={styles.outlineBtnText}>Voltar à seleção de modo</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── NOT REGISTERED ────────────────────────────────────────────────────────
  if (notRegistered) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(tabs)')} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={20} color={TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Modo Entregador</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.center}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="bicycle-outline" size={48} color={PRIMARY} />
          </View>
          <Text style={styles.emptyTitle}>Complete seu cadastro</Text>
          <Text style={styles.emptySub}>
            Para começar a fazer entregas, você precisa enviar seus documentos para análise.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/courier-register' as any)} activeOpacity={0.85}>
            <Ionicons name="document-text-outline" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Completar cadastro</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.outlineBtn, { marginTop: 8 }]} onPress={() => router.replace('/(tabs)')} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={16} color={PRIMARY} />
            <Text style={styles.outlineBtnText}>Voltar à seleção de modo</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── ERRO DE CARGA ─────────────────────────────────────────────────────────
  // Sem perfil aqui (e não é 404 → notRegistered): falha de rede/servidor. Antes caía
  // na home APPROVED com tudo undefined (offline, stats 0, botão morto) sem avisar.
  if (!profile) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(tabs)')} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={20} color={TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Modo Entregador</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.center}>
          <View style={[styles.emptyIconWrap, { backgroundColor: '#FEF2F2' }]}>
            <Ionicons name="cloud-offline-outline" size={48} color={RED} />
          </View>
          <Text style={styles.emptyTitle}>Não foi possível carregar</Text>
          <Text style={styles.emptySub}>
            Verifique sua conexão e tente novamente.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => fetchData()} activeOpacity={0.85}>
            <Ionicons name="refresh-outline" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── APPROVED HOME ─────────────────────────────────────────────────────────
  const activeDeliveries = deliveries.filter(d => d.status !== 'DELIVERED' && d.status !== 'FAILED')

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* New delivery modal */}
      {pendingDelivery && (
        <NewDeliveryModal
          delivery={pendingDelivery}
          myLocation={myLocation}
          actioning={actioning}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      )}

      {/* Código de entrega (anti-fraude) */}
      <Modal visible={!!codeModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setCodeModal(null)}>
        <View style={codeM.overlay}>
          <View style={[codeM.card, { paddingBottom: insets.bottom + 20 }]}>
            <View style={codeM.iconWrap}>
              <Ionicons name="lock-closed" size={26} color={PRIMARY} />
            </View>
            <Text style={codeM.title}>Código de entrega</Text>
            <Text style={codeM.sub}>
              Peça ao cliente os <Text style={{ fontWeight: '800' }}>6 dígitos</Text> que aparecem no app dele para confirmar a entrega.
            </Text>

            <TextInput
              style={codeM.input}
              value={codeInput}
              onChangeText={t => setCodeInput(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor="#C9B8AC"
              textAlign="center"
              autoFocus
            />

            <TouchableOpacity
              style={[codeM.confirmBtn, (codeInput.length !== 6 || advancingId) ? codeM.confirmBtnDisabled : null]}
              onPress={confirmDeliveryWithCode}
              disabled={codeInput.length !== 6 || !!advancingId}
              activeOpacity={0.85}
            >
              {advancingId ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={codeM.confirmBtnText}>Confirmar entrega</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={codeM.cancelBtn} onPress={() => setCodeModal(null)} activeOpacity={0.7} disabled={!!advancingId}>
              <Text style={[codeM.cancelBtnText, advancingId ? { opacity: 0.4 } : null]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <View style={{ width: 38 }} />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Olá, {firstName}</Text>
          <View style={[styles.statusPill, { backgroundColor: profile?.isOnline ? '#D1FAE5' : '#FEE2E2' }]}>
            <View style={[styles.statusDot, { backgroundColor: profile?.isOnline ? GREEN : RED }]} />
            <Text style={[styles.statusPillText, { color: profile?.isOnline ? GREEN : RED }]}>
              {profile?.isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData() }}
            tintColor={PRIMARY}
          />
        }
      >
        {/* Online toggle */}
        <View style={styles.onlineCard}>
          <View style={styles.onlineCardLeft}>
            <View style={[styles.onlineIconWrap, { backgroundColor: profile?.isOnline ? '#D1FAE5' : '#F5F5F5' }]}>
              <Ionicons name="radio-button-on" size={22} color={profile?.isOnline ? GREEN : MUTED} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.onlineCardTitle}>
                {profile?.isOnline ? 'Você está online' : 'Você está offline'}
              </Text>
              <Text style={styles.onlineCardSub}>
                {profile?.isOnline ? 'Você pode receber entregas agora' : 'Fique online para receber entregas'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.toggleBtn, profile?.isOnline ? styles.toggleOff : styles.toggleOn, togglingOnline && { opacity: 0.7 }]}
            onPress={handleToggleOnline}
            disabled={togglingOnline}
            activeOpacity={0.85}
          >
            {togglingOnline
              ? <ActivityIndicator size="small" color={profile?.isOnline ? TEXT : '#fff'} />
              : <Text style={[styles.toggleBtnText, { color: profile?.isOnline ? TEXT : '#fff' }]}>
                  {profile?.isOnline ? 'Ficar offline' : 'Ficar online'}
                </Text>
            }
          </TouchableOpacity>
        </View>

        {/* Location indicator */}
        {myLocation && (
          <View style={styles.locationRow}>
            <Ionicons name="locate" size={13} color={GREEN} />
            <Text style={styles.locationText}>Localização ativa</Text>
          </View>
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { icon: 'bicycle-outline' as IoniconName, value: String(stats?.todayCount ?? 0), label: 'Hoje',     color: PRIMARY, bg: PRIMARY_LIGHT },
            { icon: 'cash-outline'    as IoniconName, value: `R$ ${Number(stats?.todayEarnings ?? 0).toFixed(0)}`, label: 'Ganhos',   color: GREEN,   bg: '#D1FAE5' },
            { icon: 'star-outline'    as IoniconName, value: stats?.rating != null ? Number(stats.rating).toFixed(1) : '—', label: 'Avaliação', color: AMBER,  bg: '#FEF3C7' },
          ].map(s => (
            <View key={s.label} style={[styles.statCard, { borderColor: s.bg }]}>
              <Ionicons name={s.icon} size={20} color={s.color} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Active deliveries */}
        <Text style={styles.sectionTitle}>Entregas ativas</Text>

        {activeDeliveries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="hourglass-outline" size={36} color={MUTED} />
            <Text style={styles.emptyCardTitle}>
              {profile?.isOnline ? 'Aguardando entregas...' : 'Fique online para receber'}
            </Text>
            <Text style={styles.emptyCardSub}>
              {profile?.isOnline
                ? 'Novas entregas disponíveis aparecerão aqui automaticamente'
                : 'Ative o modo online acima para começar a receber pedidos de entrega'}
            </Text>
          </View>
        ) : (
          activeDeliveries.map(d => <DeliveryCard
            key={d.id}
            delivery={d}
            advancing={advancingId === d.id}
            onAdvance={() => handleAdvance(d.id, d.status)}
            onReturn={() => handleReturn(d.id)}
          />)
        )}
      </ScrollView>
    </View>
  )
}

// ─── Delivery card with progress steps + action button ───────────────────────

const PROGRESS_STEPS = [
  { status: 'COURIER_HEADING_TO_STORE', label: 'Até a loja', icon: 'navigate-outline' as IoniconName },
  { status: 'COURIER_AT_STORE',         label: 'Na loja',    icon: 'storefront-outline' as IoniconName },
  { status: 'PICKED_UP',                label: 'Coletado',   icon: 'bag-check-outline' as IoniconName },
  { status: 'HEADING_TO_CLIENT',        label: 'A caminho',  icon: 'bicycle-outline' as IoniconName },
  { status: 'DELIVERED',                label: 'Entregue',   icon: 'checkmark-circle-outline' as IoniconName },
]

const STATUS_ORDER = PROGRESS_STEPS.map(s => s.status)

const ACTION_BTN: Partial<Record<string, { label: string; icon: IoniconName; color: string }>> = {
  COURIER_ASSIGNED:         { label: 'A caminho da loja', icon: 'navigate-outline',     color: '#7C3AED' },
  COURIER_HEADING_TO_STORE: { label: 'Cheguei na loja',   icon: 'location-outline',     color: '#7C3AED' },
  COURIER_AT_STORE:         { label: 'Coletei o pedido',  icon: 'bag-check-outline',    color: '#0284C7' },
  PICKED_UP:                { label: 'Saí para entrega',   icon: 'bicycle',              color: '#0284C7' },
  HEADING_TO_CLIENT:        { label: 'Entreguei',          icon: 'checkmark-circle',     color: GREEN },
}

function DeliveryCard({ delivery: d, advancing, onAdvance, onReturn }: {
  delivery: Delivery
  advancing: boolean
  onAdvance: () => void
  onReturn: () => void
}) {
  const meta = STATUS_META[d.status] ?? { label: d.status, color: MUTED, icon: 'ellipsis-horizontal' as IoniconName }
  const destLat = meta.dest === 'store' ? d.order.store.lat : meta.dest === 'client' ? d.order.address.lat : null
  const destLng = meta.dest === 'store' ? d.order.store.lng : meta.dest === 'client' ? d.order.address.lng : null
  const destLabel = meta.dest === 'store' ? d.order.store.name : `${d.order.address.street}, ${d.order.address.number}`
  const action = ACTION_BTN[d.status]
  const currentStep = STATUS_ORDER.indexOf(d.status)

  return (
    <View style={styles.deliveryCard}>
      {/* Header */}
      <View style={styles.deliveryTop}>
        <Text style={styles.deliveryStore}>{d.order.store.name}</Text>
        <View style={[styles.deliveryBadge, { backgroundColor: meta.color + '22' }]}>
          <Ionicons name={meta.icon} size={11} color={meta.color} />
          <Text style={[styles.deliveryBadgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      {/* Address */}
      <View style={styles.deliveryAddrRow}>
        <Ionicons name="location-outline" size={13} color={MUTED} />
        <Text style={styles.deliveryAddr}>
          {d.order.address.street}, {d.order.address.number} — {d.order.address.district}
        </Text>
      </View>

      {/* Progress steps */}
      <View style={styles.progressRow}>
        {PROGRESS_STEPS.map((step, i) => {
          const done = currentStep > i || (d.status === step.status && step.status === 'DELIVERED')
          const active = d.status === step.status && step.status !== 'DELIVERED'
          const color = done ? GREEN : active ? meta.color : '#E0D8D2'
          return (
            <View key={step.status} style={styles.progressItem}>
              <View style={[styles.progressDot, { backgroundColor: color, borderColor: done || active ? color : '#E0D8D2' }]}>
                {done
                  ? <Ionicons name="checkmark" size={9} color="#fff" />
                  : active
                    ? <Ionicons name={step.icon} size={9} color="#fff" />
                    : null
                }
              </View>
              {i < PROGRESS_STEPS.length - 1 && (
                <View style={[styles.progressLine, { backgroundColor: currentStep > i ? GREEN : '#E0D8D2' }]} />
              )}
            </View>
          )
        })}
      </View>
      <View style={styles.progressLabels}>
        {PROGRESS_STEPS.map(step => (
          <Text key={step.status} style={[styles.progressLabel, { color: d.status === step.status ? TEXT : MUTED }]}>
            {step.label}
          </Text>
        ))}
      </View>

      {/* Bottom row: fee + maps + action */}
      <View style={styles.deliveryActions}>
        <Text style={styles.deliveryTotal}>
          R$ {Number(d.courierFee).toFixed(2)} <Text style={{ fontSize: 11, color: MUTED, fontWeight: '500' }}>ganho</Text>
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 1, justifyContent: 'flex-end' }}>
          {destLat !== null && destLng !== null && (
            <TouchableOpacity
              style={styles.mapsBtn}
              onPress={() => openMaps(destLat!, destLng!, destLabel)}
              activeOpacity={0.8}
            >
              <Ionicons name="navigate" size={13} color={PRIMARY} />
              <Text style={styles.mapsBtnText}>Rota</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.chatBtn}
            onPress={() => router.push(`/chat?orderId=${d.order.id}&peer=${encodeURIComponent('o cliente')}` as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={13} color={PRIMARY} />
            <Text style={styles.chatBtnText}>Falar</Text>
          </TouchableOpacity>
          {['COURIER_ASSIGNED', 'COURIER_HEADING_TO_STORE', 'COURIER_AT_STORE'].includes(d.status) && (
            <TouchableOpacity style={styles.returnBtn} onPress={onReturn} activeOpacity={0.8}>
              <Ionicons name="return-up-back-outline" size={13} color={RED} />
              <Text style={styles.returnBtnText}>Devolver</Text>
            </TouchableOpacity>
          )}
          {action && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: action.color }]}
              onPress={onAdvance}
              disabled={advancing}
              activeOpacity={0.85}
            >
              {advancing
                ? <ActivityIndicator size="small" color="#fff" />
                : <>
                    <Ionicons name={action.icon} size={13} color="#fff" />
                    <Text style={styles.actionBtnText}>{action.label}</Text>
                  </>
              }
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )
}

// ─── New delivery modal ───────────────────────────────────────────────────────

function NewDeliveryModal({
  delivery,
  myLocation,
  actioning,
  onAccept,
  onReject,
}: {
  delivery: Delivery
  myLocation: MyLocation | null
  actioning: 'accept' | 'reject' | null
  onAccept: () => void
  onReject: () => void
}) {
  const insets = useSafeAreaInsets()
  const [secondsLeft, setSecondsLeft] = useState(30)

  // Ref sempre com o onReject mais recente — evita chamar uma closure velha
  // (que fecharia sobre available/pendingDelivery desatualizados) ao expirar.
  const onRejectRef = useRef(onReject)
  onRejectRef.current = onReject

  useEffect(() => {
    setSecondsLeft(30)
    const interval = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) { clearInterval(interval); onRejectRef.current(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [delivery.id])

  const distToStore = myLocation
    ? haversineKm(myLocation.lat, myLocation.lng, delivery.order.store.lat, delivery.order.store.lng)
    : null
  const routeKm = delivery.distanceKm
  const timerColor = secondsLeft <= 10 ? RED : secondsLeft <= 20 ? AMBER : GREEN

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent>
      <View style={modal.overlay}>
        <View style={[modal.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {/* Drag handle */}
          <View style={modal.handle} />

          {/* Timer */}
          <View style={[modal.timerRing, { borderColor: timerColor }]}>
            <Text style={[modal.timerNumber, { color: timerColor }]}>{secondsLeft}</Text>
            <Text style={modal.timerSec}>seg</Text>
          </View>

          {/* Icon */}
          <View style={modal.iconWrap}>
            <Ionicons name="bicycle" size={30} color={PRIMARY} />
          </View>
          <Text style={modal.title}>Nova entrega disponível!</Text>
          <Text style={modal.sub}>Aceite em {secondsLeft}s ou a corrida será recusada</Text>

          {/* Info rows */}
          <View style={modal.infoBox}>
            <InfoRow icon="storefront-outline" label="Loja" value={delivery.order.store.name} />
            <View style={modal.divider} />
            <InfoRow
              icon="location-outline"
              label="Entregar em"
              // Antes do aceite mostramos só rua + bairro — o número exato do cliente
              // só aparece depois de aceitar (o backend não envia number/coords aqui).
              value={[delivery.order.address?.street, delivery.order.address?.district].filter(Boolean).join(' — ') || 'Bairro informado após aceitar'}
            />
          </View>

          {/* Badges */}
          <View style={modal.badges}>
            <Badge
              icon="cash-outline"
              color={GREEN}
              label={`R$ ${Number(delivery.courierFee).toFixed(2)}`}
              caption="Seu ganho"
            />
            {distToStore !== null && (
              <Badge
                icon="navigate-outline"
                color={PRIMARY}
                label={`${Number(distToStore).toFixed(1)} km`}
                caption="Até a loja"
              />
            )}
            <Badge
              icon="map-outline"
              color="#7C3AED"
              label={`${Number(routeKm).toFixed(1)} km`}
              caption="Percurso"
            />
          </View>

          {/* Actions */}
          <View style={modal.actions}>
            <TouchableOpacity
              style={[modal.btn, modal.rejectBtn]}
              onPress={onReject}
              disabled={!!actioning}
              activeOpacity={0.85}
            >
              {actioning === 'reject'
                ? <ActivityIndicator color={RED} size="small" />
                : <>
                    <Ionicons name="close-circle-outline" size={18} color={RED} />
                    <Text style={[modal.btnText, { color: RED }]}>Recusar</Text>
                  </>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={[modal.btn, modal.acceptBtn]}
              onPress={onAccept}
              disabled={!!actioning}
              activeOpacity={0.85}
            >
              {actioning === 'accept'
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={[modal.btnText, { color: '#fff' }]}>Aceitar entrega</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function InfoRow({ icon, label, value }: { icon: IoniconName; label: string; value: string }) {
  return (
    <View style={modal.infoRow}>
      <View style={modal.infoIcon}>
        <Ionicons name={icon} size={15} color={PRIMARY} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={modal.infoLabel}>{label}</Text>
        <Text style={modal.infoValue}>{value}</Text>
      </View>
    </View>
  )
}

function Badge({ icon, color, label, caption }: { icon: IoniconName; color: string; label: string; caption: string }) {
  return (
    <View style={[modal.badge, { borderColor: color + '33' }]}>
      <Ionicons name={icon} size={15} color={color} />
      <Text style={[modal.badgeLabel, { color }]}>{label}</Text>
      <Text style={modal.badgeCaption}>{caption}</Text>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 4 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: CARD,
    borderBottomWidth: 1, borderBottomColor: BORDER,
    gap: 10,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: PRIMARY_LIGHT,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center', gap: 4 },
  headerTitle: { fontSize: 15, fontWeight: '800', color: TEXT },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontSize: 11, fontWeight: '700' },

  locationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 4, paddingBottom: 8,
  },
  locationText: { fontSize: 11, color: GREEN, fontWeight: '600' },

  onlineCard: {
    backgroundColor: CARD, borderRadius: 18, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12, marginTop: 12,
    borderWidth: 1, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 3,
  },
  onlineCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  onlineIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  onlineCardTitle: { fontSize: 14, fontWeight: '800', color: TEXT, marginBottom: 2 },
  onlineCardSub: { fontSize: 11, color: MUTED, fontWeight: '500' },

  toggleBtn: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center', minWidth: 96,
  },
  toggleOn: {
    backgroundColor: GREEN,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  toggleOff: { backgroundColor: '#F5F5F5', borderWidth: 1.5, borderColor: BORDER },
  toggleBtnText: { fontSize: 12, fontWeight: '800' },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: CARD, borderRadius: 14, padding: 14,
    alignItems: 'center', gap: 6, borderWidth: 1.5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  statValue: { fontSize: 18, fontWeight: '900', color: TEXT },
  statLabel: { fontSize: 11, color: MUTED, fontWeight: '600' },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: MUTED,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 10,
  },

  emptyCard: {
    backgroundColor: CARD, borderRadius: 18, padding: 28,
    alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: BORDER,
  },
  emptyCardTitle: { fontSize: 15, fontWeight: '700', color: TEXT, marginTop: 4 },
  emptyCardSub: { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 19 },

  deliveryCard: {
    backgroundColor: CARD, borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  deliveryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  deliveryStore: { fontSize: 14, fontWeight: '800', color: TEXT, flex: 1, marginRight: 8 },
  deliveryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  deliveryBadgeText: { fontSize: 11, fontWeight: '700' },
  deliveryAddrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: 10 },
  deliveryAddr: { flex: 1, fontSize: 12, color: MUTED, lineHeight: 17 },
  deliveryBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deliveryActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  deliveryTotal: { fontSize: 15, fontWeight: '900', color: PRIMARY },
  mapsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 10, backgroundColor: PRIMARY_LIGHT,
    borderWidth: 1, borderColor: PRIMARY + '33',
  },
  mapsBtnText: { fontSize: 12, fontWeight: '700', color: PRIMARY },
  chatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 10, backgroundColor: PRIMARY_LIGHT,
    borderWidth: 1, borderColor: PRIMARY + '33',
  },
  chatBtnText: { fontSize: 12, fontWeight: '700', color: PRIMARY },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3,
  },
  actionBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  returnBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
  },
  returnBtnText: { fontSize: 12, fontWeight: '700', color: RED },

  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 2 },
  progressItem: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  progressDot: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  progressLine: { flex: 1, height: 2, marginHorizontal: 2 },
  progressLabels: { flexDirection: 'row', marginBottom: 4 },
  progressLabel: { flex: 1, fontSize: 9, fontWeight: '600', textAlign: 'center' },

  emptyIconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: PRIMARY_LIGHT,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: TEXT, marginBottom: 8, textAlign: 'center' },
  emptySub: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 21, marginBottom: 24 },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: 12, backgroundColor: PRIMARY,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1.5, borderColor: PRIMARY,
    backgroundColor: PRIMARY_LIGHT,
  },
  outlineBtnText: { fontSize: 14, fontWeight: '700', color: PRIMARY },
})

const modal = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: CARD,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    alignItems: 'center',
    maxHeight: SCREEN_H * 0.85,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#E0D8D2', marginBottom: 16,
  },
  timerRing: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
    marginBottom: 14, alignSelf: 'center',
  },
  timerNumber: { fontSize: 22, fontWeight: '900', lineHeight: 24 },
  timerSec: { fontSize: 9, fontWeight: '700', color: MUTED, marginTop: -2 },
  iconWrap: {
    width: 68, height: 68, borderRadius: 20,
    backgroundColor: PRIMARY_LIGHT,
    borderWidth: 2, borderColor: PRIMARY + '33',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 20, fontWeight: '900', color: TEXT, letterSpacing: -0.3, marginBottom: 4 },
  sub: { fontSize: 13, color: MUTED, marginBottom: 20 },

  infoBox: {
    width: '100%', backgroundColor: BG,
    borderRadius: 16, padding: 4,
    borderWidth: 1, borderColor: BORDER,
    marginBottom: 16,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 },
  infoIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: PRIMARY_LIGHT,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  infoLabel: { fontSize: 11, color: MUTED, fontWeight: '600', marginBottom: 2 },
  infoValue: { fontSize: 14, color: TEXT, fontWeight: '600', lineHeight: 19 },
  divider: { height: 1, backgroundColor: BORDER, marginHorizontal: 12 },

  badges: { flexDirection: 'row', gap: 8, width: '100%', marginBottom: 24 },
  badge: {
    flex: 1, borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
    alignItems: 'center', gap: 4,
    backgroundColor: CARD,
  },
  badgeLabel: { fontSize: 14, fontWeight: '900' },
  badgeCaption: { fontSize: 10, color: MUTED, fontWeight: '600' },

  actions: { flexDirection: 'row', gap: 10, width: '100%' },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 16, borderRadius: 16,
  },
  rejectBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5, borderColor: RED + '44',
  },
  acceptBtn: {
    backgroundColor: PRIMARY,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
    flex: 1.5,
  },
  btnText: { fontSize: 15, fontWeight: '800' },
})

const pendingCard = StyleSheet.create({
  box: {
    width: '100%', backgroundColor: CARD,
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: BORDER,
    gap: 12, marginBottom: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: PRIMARY_LIGHT,
    alignItems: 'center', justifyContent: 'center',
  },
  text: { flex: 1, fontSize: 13, color: MUTED, fontWeight: '500', lineHeight: 18 },
})

const codeM = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', paddingHorizontal: 24 },
  card: { backgroundColor: CARD, borderRadius: 24, padding: 24, alignItems: 'center' },
  iconWrap: {
    width: 56, height: 56, borderRadius: 18, backgroundColor: PRIMARY_LIGHT,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  title: { fontSize: 19, fontWeight: '800', color: TEXT, marginBottom: 6 },
  sub: { fontSize: 13.5, color: MUTED, textAlign: 'center', lineHeight: 19, marginBottom: 18 },
  input: {
    width: '70%', height: 64, borderRadius: 16, borderWidth: 2, borderColor: BORDER,
    backgroundColor: BG, fontSize: 32, fontWeight: '800', color: TEXT, letterSpacing: 10,
    marginBottom: 16,
  },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10,
    paddingHorizontal: 14, marginBottom: 12,
  },
  photoBtnText: { fontSize: 13.5, fontWeight: '600', color: MUTED },
  confirmBtn: {
    width: '100%', height: 54, borderRadius: 16, backgroundColor: PRIMARY,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  cancelBtn: { paddingVertical: 14 },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: MUTED },
})
