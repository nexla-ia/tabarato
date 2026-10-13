import { useState, useRef, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Modal, TextInput, KeyboardAvoidingView,
  Platform, Pressable, Alert, Linking,
} from 'react-native'
import { AppAlert, AlertType } from '../src/components/AppAlert'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../src/api/client'
import { useCartStore } from '../src/stores/cart.store'
import { useConsumerStore } from '../src/stores/consumer.store'
import { useAuthStore } from '../src/stores/auth.store'
import { Address } from '../src/types'
import { validateCardForm, validateCpf } from '../src/utils/cardValidation'
import { loadCardMeta, saveCardMeta, cardLabel, SavedCardMeta } from '../src/utils/savedCard'
import { MpDeviceWebView } from '../src/components/MpDeviceWebView'

const PRIMARY = '#FF5500'
const PRIMARY_LIGHT = '#FFF0EB'
const SUCCESS = '#059669'
const BG = '#FFF8F3'
const TEXT = '#1A0A00'
const MUTED = '#9A8880'
const CARD = '#FFFFFF'
const BORDER = '#F0E8E2'

// Vilhena-RO fallback coordinates
const VILHENA_LAT = -12.7406
const VILHENA_LNG = -60.1478

async function fetchCepData(cep: string): Promise<{
  street: string; district: string; city: string; state: string
  lat: number; lng: number; coordsFallback?: boolean
} | null> {
  const digits = cep.replace(/\D/g, '')
  if (digits.length !== 8) return null
  try {
    const viaRes = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
    const via = await viaRes.json()
    if (via.erro) return null

    const street   = via.logradouro  || ''
    const district = via.bairro      || ''
    const city     = via.localidade  || 'Vilhena'
    const state    = via.uf          || 'RO'

    const query = encodeURIComponent(`${digits}, ${city}, ${state}, Brasil`)
    const geoRes = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`,
      { headers: { 'Accept-Language': 'pt-BR', 'User-Agent': 'TabaratoApp/1.0' } },
    )
    const geo = await geoRes.json()

    if (!geo[0]) {
      // Fallback — mark as approximate so UI can warn the user
      return { street, district, city, state, lat: VILHENA_LAT, lng: VILHENA_LNG, coordsFallback: true }
    }

    return { street, district, city, state, lat: parseFloat(geo[0].lat), lng: parseFloat(geo[0].lon) }
  } catch {
    return null
  }
}

const MP_PUBLIC_KEY = process.env.EXPO_PUBLIC_MP_PUBLIC_KEY ?? ''

// Gera uma chave de idempotência nova. Cada TENTATIVA de pagamento distinta
// (trocar de método, ou refazer após uma recusa) precisa da própria chave —
// senão o backend devolve o pedido da tentativa anterior (que pode ter sido
// cancelada) sem cobrar de novo.
function genIdemKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const PAYMENT_METHODS = [
  { value: 'PIX',         label: 'Pix',    desc: 'Pagamento instantâneo',       icon: 'flash', iconColor: '#059669', iconBg: '#D1FAE5' },
  { value: 'CREDIT_CARD', label: 'Cartão', desc: 'Crédito ou débito · via MP',  icon: 'card',  iconColor: '#2563EB', iconBg: '#DBEAFE' },
] as const

// Parcelamento: 1x a 10x.
const INSTALLMENT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

async function tokenizeCard(cardData: {
  cardNumber: string; cvv: string; expiryMonth: string; expiryYear: string
  holderName: string; cpf: string
}): Promise<string> {
  const res = await fetch(
    `https://api.mercadopago.com/v1/card_tokens?public_key=${MP_PUBLIC_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_number:      cardData.cardNumber.replace(/\s/g, ''),
        security_code:    cardData.cvv,
        expiration_month: parseInt(cardData.expiryMonth, 10),
        expiration_year:  parseInt(cardData.expiryYear.length === 2 ? `20${cardData.expiryYear}` : cardData.expiryYear, 10),
        cardholder: {
          name: cardData.holderName.toUpperCase(),
          identification: { type: 'CPF', number: cardData.cpf.replace(/\D/g, '') },
        },
      }),
    },
  )
  const json = await res.json()
  if (!res.ok || !json.id) throw new Error(json.cause?.[0]?.description ?? 'Erro ao tokenizar cartão')
  return json.id as string
}

const LABEL_SUGGESTIONS = ['Casa', 'Trabalho', 'Casa dos pais', 'Outro']

const EMPTY_FORM = {
  label: 'Casa',
  zipCode: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: 'Vilhena',
  state: 'RO',
}


export default function CheckoutScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const { items, groups, total, clearCart, storeSubtotal, storePromoDiscount } = useCartStore()
  const cartGroups = groups()
  const singleStore = cartGroups.length === 1

  const { lastUsedAddressId, setLastUsedAddressId } = useConsumerStore()
  const [selectedAddress, setSelectedAddress] = useState<string>(lastUsedAddressId ?? '')
  const [paymentMethod, setPaymentMethod] = useState<string>('PIX')
  // Se o método selecionado não existir mais (ex.: removido), volta pro 1º (PIX).
  useEffect(() => {
    if (!PAYMENT_METHODS.some((p) => p.value === paymentMethod)) {
      setPaymentMethod(PAYMENT_METHODS[0].value)
    }
  }, [paymentMethod])
  // Coordenadas por loja (multi-loja: 1 entrega por loja) → frete somado.
  const [storeCoordsMap, setStoreCoordsMap] = useState<Record<string, { lat: number; lng: number }>>({})
  // Nome/endereço/telefone de cada loja — usado na retirada na loja (onde buscar).
  const [storeInfoMap, setStoreInfoMap] = useState<Record<string, { name?: string; address?: string; phone?: string }>>({})
  const [estimatedFee, setEstimatedFee] = useState<number | null>(null)
  // Taxa de entrega por loja vinda do BACKEND (reflete a config de preços atual).
  const [storeFeesMap, setStoreFeesMap] = useState<Record<string, number>>({})

  // Card form state
  const [cardNumber, setCardNumber]     = useState('')
  const [cardHolder, setCardHolder]     = useState('')
  const [cardExpiry, setCardExpiry]     = useState('')
  const [cardCvv, setCardCvv]           = useState('')
  const [cardCpf, setCardCpf]           = useState('')
  const [installments, setInstallments] = useState(1)
  // Device fingerprint do MP (gerado por WebView oculto) — reduz cc_rejected_high_risk
  const [deviceId, setDeviceId] = useState<string>()
  const isCard = paymentMethod === 'CREDIT_CARD'
  const [savedCard, setSavedCard] = useState<SavedCardMeta | null>(null)
  const [usingSavedCard, setUsingSavedCard] = useState(false)

  // Provedor de pagamento ativo (backend). O Asaas exige o CPF do pagador no PIX;
  // o Mercado Pago não — por isso o campo de CPF só aparece quando o PIX é Asaas.
  const { data: payCfg } = useQuery({
    queryKey: ['payment-config'],
    queryFn: async () => (await api.get('/payments/config')).data as { pix: string; card: string; maxDeliveryValue?: number },
    staleTime: 5 * 60 * 1000,
  })
  const asaasPix = payCfg?.pix === 'ASAAS'
  // ── Retirada na loja ──
  // Acima do teto (por loja), a entrega por motoboy é bloqueada → só retirada.
  // maxDeliveryValue = 0 significa "sem limite".
  const maxDeliveryValue = payCfg?.maxDeliveryValue ?? 0
  const overCapStoreIds = maxDeliveryValue > 0
    ? cartGroups.filter((g) => storeSubtotal(g.storeId) > maxDeliveryValue).map((g) => g.storeId)
    : []
  const mustPickup = overCapStoreIds.length > 0
  const [pickupChosen, setPickupChosen] = useState(false)
  const isPickup = mustPickup || pickupChosen
  // Cartão via Asaas = Checkout hospedado: abre a página do Asaas (sem formulário aqui).
  const cardCheckout = payCfg?.card === 'ASAAS'
  const [pixCpf, setPixCpf] = useState('')
  // Pré-preenche o CPF do PIX com o do usuário, se já estiver salvo (evita redigitar).
  useEffect(() => {
    if ((user as any)?.cpf && !pixCpf) setPixCpf(formatCpf((user as any).cpf))
  }, [user])

  // Load saved card on mount
  useEffect(() => {
    loadCardMeta().then(meta => {
      if (meta) { setSavedCard(meta); setUsingSavedCard(true) }
    })
  }, [])

  // Pre-fill card fields when using saved card (except CVV — security requirement)
  useEffect(() => {
    if (usingSavedCard && savedCard) {
      setCardHolder(savedCard.holderName)
      setCardExpiry(`${savedCard.expiryMonth}/${savedCard.expiryYear}`)
    }
  }, [usingSavedCard, savedCard])

  // Scheduling
  const [isScheduled, setIsScheduled] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')  // YYYY-MM-DD
  const [scheduleTime, setScheduleTime] = useState('')  // HH:MM

  // Cupom POR LOJA (multi-loja: cada loja pode ter o seu).
  type CouponRes = { code: string; discount: number; description?: string; freeShipping?: boolean }
  const [couponInputs, setCouponInputs] = useState<Record<string, string>>({})
  const [couponResults, setCouponResults] = useState<Record<string, CouponRes>>({})
  const [couponErrors, setCouponErrors] = useState<Record<string, string>>({})
  const [checkingStore, setCheckingStore] = useState<string | null>(null)

  // Loyalty points redemption
  const [loyaltyPoints, setLoyaltyPoints] = useState(0)
  const [pointsToRedeem, setPointsToRedeem] = useState(0)
  const [loyaltyDiscount, setLoyaltyDiscount] = useState(0)

  useEffect(() => {
    api.get('/users/me/loyalty').then(r => setLoyaltyPoints(r.data.points ?? 0)).catch(() => {})
  }, [])

  // Calcula os totais do pedido dado um mapa de cupons (real ou hipotético).
  // Centraliza a regra: cupom+promoção nunca passam do subtotal; total nunca < 0.
  function computeTotals(couponMap: Record<string, CouponRes>) {
    const sub = total()
    const addr = addresses?.find((a) => a.id === selectedAddress)
    const perStore = cartGroups.map((g) => {
      // Taxa vem do backend (cotação); enquanto não chega, null → "calculando".
      const delivery = (addr?.lat != null && addr?.lng != null && storeFeesMap[g.storeId] != null)
        ? storeFeesMap[g.storeId]
        : null
      const res = couponMap[g.storeId]
      const promo = storePromoDiscount(g.storeId)
      const coupon = Math.min(res?.discount ?? 0, Math.max(0, storeSubtotal(g.storeId) - promo))
      return { storeId: g.storeId, delivery, freeShip: !!res?.freeShipping, coupon, promo }
    })
    // Retirada na loja: sem frete — não espera cotação (deliveryKnown = true, taxa 0).
    const deliveryKnown = isPickup ? true : (perStore.length > 0 && perStore.every((s) => s.delivery != null))
    const deliveryFee = isPickup ? 0 : (deliveryKnown ? perStore.reduce((s, x) => s + (x.delivery ?? 0), 0) : (estimatedFee ?? 0))
    const deliveryCharged = isPickup ? 0 : (deliveryKnown ? perStore.reduce((s, x) => s + (x.freeShip ? 0 : (x.delivery ?? 0)), 0) : deliveryFee)
    const freeShipping = !isPickup && perStore.some((x) => x.freeShip)
    const couponDiscount = perStore.reduce((s, x) => s + x.coupon, 0)
    const promoDiscount = Math.round(perStore.reduce((s, x) => s + x.promo, 0) * 100) / 100
    const discount = Math.min(Math.round((couponDiscount + loyaltyDiscount + promoDiscount) * 100) / 100, sub)
    const orderTotal = Math.max(0, Math.round((sub + deliveryCharged - discount) * 100) / 100)
    return { deliveryKnown, deliveryFee, deliveryCharged, freeShipping, couponDiscount, promoDiscount, discount, orderTotal }
  }

  async function applyCoupon(storeId: string) {
    const code = (couponInputs[storeId] ?? '').trim()
    if (!code || checkingStore) return  // debounce: ignora enquanto valida
    setCheckingStore(storeId)
    setCouponErrors((e) => ({ ...e, [storeId]: '' }))
    try {
      const { data } = await api.get('/coupons/validate', {
        params: { code, subtotal: storeSubtotal(storeId), storeId },
      })
      const newRes: CouponRes = { code: data.code, discount: data.discount, description: data.description, freeShipping: data.freeShipping }
      // Bloqueia o cupom só se ZERAR o pedido de verdade — e SÓ quando o frete já é
      // conhecido (senão deliveryCharged=0 daria falso positivo e recusaria um cupom
      // válido que, com o frete somado, deixaria total > 0). Sem frete conhecido, deixa
      // aplicar: o botão Confirmar (desabilita em total<=0) e o backend ainda barram o zero.
      const t = computeTotals({ ...couponResults, [storeId]: newRes })
      if (t.deliveryKnown && t.orderTotal <= 0) {
        setCouponErrors((e) => ({ ...e, [storeId]: 'Esse cupom zeraria o pedido junto com a promoção. Use outro cupom ou reduza a promoção.' }))
        return
      }
      setCouponResults((r) => ({ ...r, [storeId]: newRes }))
    } catch (err: any) {
      setCouponErrors((e) => ({ ...e, [storeId]: err.response?.data?.message ?? 'Cupom inválido' }))
    } finally {
      setCheckingStore(null)
    }
  }

  function removeCoupon(storeId: string) {
    setCouponResults((r) => { const n = { ...r }; delete n[storeId]; return n })
    setCouponInputs((i) => ({ ...i, [storeId]: '' }))
    setCouponErrors((e) => ({ ...e, [storeId]: '' }))
  }

  // Address bottom sheet
  const [showAddrSheet, setShowAddrSheet] = useState(false)
  const [addrForm, setAddrForm] = useState(EMPTY_FORM)
  const [savingAddr, setSavingAddr] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [addrCoords, setAddrCoords] = useState({ lat: VILHENA_LAT, lng: VILHENA_LNG })

  // Custom alert
  const [alertConfig, setAlertConfig] = useState<{
    type: AlertType; title: string; message?: string
    confirmText?: string; cancelText?: string
    onConfirm?: () => void
  } | null>(null)

  function showAlert(cfg: typeof alertConfig) { setAlertConfig(cfg) }
  function hideAlert() { setAlertConfig(null) }

  // Busca as coordenadas de CADA loja do carrinho pra estimar o frete (1 por loja).
  const storeIdsKey = cartGroups.map(g => g.storeId).join(',')
  useEffect(() => {
    const ids = storeIdsKey ? storeIdsKey.split(',') : []
    if (!ids.length) return
    Promise.all(ids.map(id =>
      api.get(`/stores/${id}`).then(r => [id, r.data] as const).catch(() => null)
    )).then(pairs => {
      const coords: Record<string, { lat: number; lng: number }> = {}
      const info: Record<string, { name?: string; address?: string; phone?: string }> = {}
      for (const p of pairs) if (p) {
        coords[p[0]] = { lat: p[1].lat, lng: p[1].lng }
        info[p[0]] = { name: p[1].name, address: p[1].address, phone: p[1].phone }
      }
      setStoreCoordsMap(coords)
      setStoreInfoMap(info)
    })
  }, [storeIdsKey])

  const { data: addresses, refetch: refetchAddresses } = useQuery({
    queryKey: ['addresses'],
    queryFn: async () => {
      const { data } = await api.get<Address[]>('/users/me/addresses')
      if (data.length > 0 && !selectedAddress) {
        // Restore last used address, or fall back to default/first
        const lastUsed = lastUsedAddressId ? data.find(a => a.id === lastUsedAddressId) : null
        const def = lastUsed ?? data.find((a) => a.isDefault) ?? data[0]
        setSelectedAddress(def.id)
      }
      return data
    },
  })

  // Chave de idempotência estável entre retries do MESMO pagamento (evita cobrança
  // duplicada em timeout/duplo-tap). É renovada ao trocar de método ou após uma
  // recusa (ver genIdemKey / onError) pra que uma nova tentativa gere um pedido novo.
  const idemKey = useRef(genIdemKey())

  const { mutate: placeOrder, isPending } = useMutation({
    mutationFn: async () => {
      // Agendamento: valida ANTES de qualquer chamada — data incompleta/inválida
      // faria new Date().toISOString() lançar RangeError com erro genérico.
      let scheduledForIso: string | undefined
      if (isScheduled) {
        if (!scheduleDate || !scheduleTime) {
          throw new Error('Selecione a data e o horário do agendamento.')
        }
        const when = new Date(`${scheduleDate}T${scheduleTime}:00`)
        if (isNaN(when.getTime())) {
          throw new Error('Data ou horário de agendamento inválidos.')
        }
        if (when.getTime() <= Date.now()) {
          throw new Error('O horário do agendamento deve ser no futuro.')
        }
        scheduledForIso = when.toISOString()
      }

      let cardToken: string | undefined
      // No modo Checkout (Asaas) o cartão é preenchido na página do Asaas — não tokeniza aqui.
      if (isCard && !cardCheckout) {
        const [month, year] = cardExpiry.split('/')
        cardToken = await tokenizeCard({
          cardNumber, cvv: cardCvv, expiryMonth: month?.trim() ?? '', expiryYear: year?.trim() ?? '',
          holderName: cardHolder, cpf: cardCpf,
        })
      }

      const { data } = await api.post('/orders', {
        // Carrinho multi-loja: 1 grupo por loja → o backend cria N pedidos, 1 pagamento.
        groups: cartGroups.map((g) => ({
          storeId: g.storeId,
          couponCode: couponResults[g.storeId]?.code,
          items: g.items.map((i) => ({
            productId: i.product.id,
            variationId: i.variation?.id,
            quantity: i.quantity,
            notes: i.notes || undefined,
          })),
        })),
        addressId: selectedAddress,
        fulfillmentType: isPickup ? 'PICKUP' : 'DELIVERY',
        paymentMethod,
        pointsToRedeem: pointsToRedeem > 0 ? pointsToRedeem : undefined,
        idempotencyKey: idemKey.current,
        cardToken,
        installments: isCard ? installments : undefined,
        payerCpf: isCard ? cardCpf : (asaasPix ? pixCpf : undefined),
        deviceId: isCard ? deviceId : undefined,
        scheduledFor: scheduledForIso,
      }, {
        // Criar o pedido gera o PIX / cobra o cartão no Mercado Pago (round-trips
        // externos) — passa fácil dos 10s padrão do axios e viraria "Network Error".
        timeout: 45_000,
      })
      return data
    },
    onSuccess: (data: any) => {
      // Resposta multi-loja: { orders, payment }. Legado (1 loja): o próprio pedido.
      const orders: any[] = Array.isArray(data?.orders) ? data.orders : (data ? [data] : [])
      const firstOrder = orders[0]
      const allCancelled = orders.length > 0 && orders.every((o) => o?.status === 'CANCELLED')
      // Defesa: sem pedido ou todos cancelados (ex.: idempotência pegando tentativa
      // morta) → NÃO mostra sucesso; renova a chave e pede retry.
      if (!firstOrder || allCancelled) {
        idemKey.current = genIdemKey()
        showAlert({
          type: 'error',
          title: 'Pagamento não concluído',
          message: 'O pagamento não foi confirmado. Confira os dados e tente novamente.',
          confirmText: 'Entendi',
        })
        return
      }
      // Cartão via Checkout Asaas: abre a página segura do Asaas no navegador. Ao
      // voltar ao app, a tela do pedido confirma pelo status (webhook CHECKOUT_PAID).
      const checkoutUrl = data?.payment?.checkoutUrl ?? firstOrder?.payment?.checkoutUrl
      if (isCard && cardCheckout && checkoutUrl) {
        setLastUsedAddressId(selectedAddress)
        clearCart()
        Linking.openURL(checkoutUrl).catch(() => {})
        showAlert({
          type: 'info',
          title: 'Pagar com cartão',
          message: 'Abrimos a página segura do Asaas para você informar os dados do cartão. Depois de pagar, volte ao app — o pedido confirma automaticamente.',
          confirmText: 'Ok',
          onConfirm: () => { hideAlert(); router.replace(`/order/${firstOrder.id}` as any) },
        })
        return
      }

      setLastUsedAddressId(selectedAddress)
      // Save card metadata after successful card payment
      if (isCard && cardNumber && !usingSavedCard) {
        const [month, year] = cardExpiry.split('/')
        saveCardMeta(cardNumber, cardHolder, month?.trim() ?? '', year?.trim() ?? '').catch(() => {})
      }
      clearCart()
      const nStores = orders.length
      if (paymentMethod === 'PIX') {
        // PIX ainda NÃO foi pago — leva pra tela do pedido, que mostra o QR Code (único
        // pra todas as lojas) e o copia-e-cola. (Cartão já é cobrado na hora.)
        showAlert({
          type: 'success',
          title: 'Pedido criado! Falta pagar',
          message: nStores > 1
            ? `${nStores} pedidos criados (1 por loja), num pagamento só. Na próxima tela, pague o QR Code / código PIX.`
            : 'Na próxima tela, escaneie o QR Code ou copie o código PIX para concluir o pagamento.',
          confirmText: 'Pagar com PIX',
          onConfirm: () => { hideAlert(); router.replace(`/order/${firstOrder.id}` as any) },
        })
      } else {
        showAlert({
          type: 'success',
          title: nStores > 1 ? 'Pedidos confirmados!' : 'Pedido confirmado!',
          message: nStores > 1
            ? `${nStores} pedidos (1 por loja) recebidos e pagos. Acompanhe em Meus Pedidos.`
            : `Pedido #${firstOrder.id.slice(-6).toUpperCase()} recebido. Acompanhe em Meus Pedidos.`,
          confirmText: 'Ver meus pedidos',
          onConfirm: () => { hideAlert(); router.replace('/(tabs)/orders') },
        })
      }
    },
    onError: (err: any) => {
      // Se o servidor respondeu com erro (pedido cancelado / cartão recusado / PIX
      // não gerou), a tentativa morreu no backend: renova a chave pra próxima não
      // cair na idempotência e voltar o pedido morto. Erro de rede (sem response)
      // mantém a chave — a cobrança pode ter passado e o retry deve ser idempotente.
      if (err?.response) idemKey.current = genIdemKey()
      // Erros de validação locais (agendamento) chegam como Error.message;
      // erros da API vêm em response.data.message.
      const apiMsg: string | undefined = err.response?.data?.message
      const message = apiMsg ?? (err instanceof Error ? err.message : null) ?? 'Tente novamente em alguns instantes.'

      // PIX indisponível nesta loja (conta MP sem chave PIX): oferece trocar pra
      // cartão direto no alerta, sem o cliente ter que procurar a opção.
      const pixUnavailable = paymentMethod === 'PIX' && typeof apiMsg === 'string' && /pix/i.test(apiMsg)
      if (pixUnavailable) {
        showAlert({
          type: 'warning',
          title: 'PIX indisponível nesta loja',
          message,
          confirmText: 'Pagar com cartão',
          cancelText: 'Agora não',
          onConfirm: () => {
            hideAlert()
            idemKey.current = genIdemKey()
            setPaymentMethod('CREDIT_CARD')
            setInstallments(1)
          },
        })
        return
      }

      showAlert({
        type: 'error',
        title: 'Não foi possível finalizar',
        message,
        confirmText: 'Entendi',
      })
    },
  })

  async function handleCepChange(raw: string) {
    const formatted = raw.replace(/\D/g, '').slice(0, 8)
    const display = formatted.length > 5 ? `${formatted.slice(0, 5)}-${formatted.slice(5)}` : formatted
    setField('zipCode')(display)
    if (formatted.length === 8) {
      setCepLoading(true)
      const result = await fetchCepData(formatted)
      setCepLoading(false)
      if (result) {
        setAddrForm((f) => ({
          ...f,
          zipCode: display,
          street:   result.street   || f.street,
          district: result.district || f.district,
          city:     result.city     || f.city,
          state:    result.state    || f.state,
        }))
        setAddrCoords({ lat: result.lat, lng: result.lng })

        if (result.coordsFallback) {
          showAlert({
            type: 'warning',
            title: 'Localização aproximada',
            message: `Não encontramos as coordenadas exatas de "${result.city}". A entrega será calculada com base na cidade. Confirme o endereço completo antes de prosseguir.`,
            confirmText: 'Entendido',
          })
        }
      }
    }
  }

  async function handleSaveAddress() {
    const { label, street, number, district, city, state, zipCode } = addrForm
    if (!label || !street || !number || !district || !city || !zipCode) {
      showAlert({ type: 'warning', title: 'Campos obrigatórios', message: 'Preencha rua, número, bairro, cidade e CEP para continuar.', confirmText: 'Ok' })
      return
    }
    setSavingAddr(true)
    try {
      const { data } = await api.post<Address>('/users/me/addresses', {
        label,
        street,
        number,
        complement: addrForm.complement || undefined,
        district,
        city,
        state,
        zipCode,
        lat: addrCoords.lat,
        lng: addrCoords.lng,
        isDefault: !addresses || addresses.length === 0,
      })
      await refetchAddresses()
      setSelectedAddress(data.id)
      setShowAddrSheet(false)
      setAddrForm(EMPTY_FORM)
      setAddrCoords({ lat: VILHENA_LAT, lng: VILHENA_LNG })
    } catch (e: any) {
      // Close modal first so alert renders above the screen, not inside the modal
      setShowAddrSheet(false)
      setTimeout(() => {
        showAlert({ type: 'error', title: 'Erro ao salvar endereço', message: e.response?.data?.message ?? 'Não foi possível salvar. Verifique os dados e tente novamente.', confirmText: 'Ok' })
      }, 300)
    } finally {
      setSavingAddr(false)
    }
  }

  function formatCardNumber(val: string) {
    return val.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
  }
  function formatExpiry(val: string) {
    const digits = val.replace(/\D/g, '').slice(0, 4)
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
  }
  function formatCpf(val: string) {
    return val.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }

  function handleConfirm() {
    // Carrinho vazio (ex.: pedido anterior já finalizado e limpou o carrinho) —
    // evita mandar sem storeId/itens e cair no erro "storeId must be a string".
    if (items.length === 0 || cartGroups.length === 0) {
      showAlert({ type: 'warning', title: 'Carrinho vazio', message: 'Seu carrinho está vazio. Volte à loja e adicione itens antes de finalizar.', confirmText: 'Ok', onConfirm: () => { hideAlert(); router.replace('/(tabs)') } })
      return
    }
    if (!selectedAddress) {
      showAlert({
        type: 'warning',
        title: 'Atenção',
        message: isPickup
          ? 'Cadastre um endereço na sua conta para continuar (usado só no seu cadastro — a retirada é na loja).'
          : 'Selecione um endereço de entrega para continuar.',
        confirmText: 'Ok',
      })
      return
    }
    if (isCard && !cardCheckout) {
      if (!cardHolder.trim()) {
        showAlert({ type: 'warning', title: 'Nome obrigatório', message: 'Digite o nome como aparece no cartão.', confirmText: 'Ok' })
        return
      }
      const cardErrors = validateCardForm({ cardNumber, expiry: cardExpiry, cvv: cardCvv, cpf: cardCpf })
      if (cardErrors.cardNumber) {
        showAlert({ type: 'warning', title: 'Cartão inválido', message: cardErrors.cardNumber, confirmText: 'Ok' })
        return
      }
      if (cardErrors.expiry) {
        showAlert({ type: 'warning', title: 'Validade inválida', message: cardErrors.expiry, confirmText: 'Ok' })
        return
      }
      if (cardErrors.cvv) {
        showAlert({ type: 'warning', title: 'CVV inválido', message: cardErrors.cvv, confirmText: 'Ok' })
        return
      }
      if (cardErrors.cpf) {
        showAlert({ type: 'warning', title: 'CPF inválido', message: cardErrors.cpf, confirmText: 'Ok' })
        return
      }
    }
    // PIX via Asaas exige o CPF do pagador pra emitir a cobrança.
    if (!isCard && asaasPix && !validateCpf(pixCpf)) {
      showAlert({
        type: 'warning',
        title: 'CPF obrigatório',
        message: pixCpf ? 'CPF inválido. Confira os números.' : 'Informe seu CPF para pagar com PIX.',
        confirmText: 'Ok',
      })
      return
    }
    placeOrder()
  }

  function setField(key: keyof typeof EMPTY_FORM) {
    return (val: string) => setAddrForm((f) => ({ ...f, [key]: val }))
  }

  // Recalculate estimated delivery fee when address or store coords change.
  // IMPORTANTE: precisa ficar ANTES do guest gate (early return), senão o número
  // de hooks muda quando o user entra e o React quebra ("Rendered more hooks…").
  useEffect(() => {
    if (!addresses || !selectedAddress) { setEstimatedFee(null); return }
    const addr = addresses.find(a => a.id === selectedAddress)
    if (!addr?.lat || !addr?.lng) { setEstimatedFee(null); return }
    // Cota o frete de CADA loja no BACKEND (1 entrega por loja) — reflete a config
    // de preços atual. Só finaliza quando tem as coords de todas.
    const ids = [...new Set(cartGroups.map(g => g.storeId))]
    if (!ids.length || ids.some(id => !storeCoordsMap[id])) { setEstimatedFee(null); return }
    let cancelled = false
    Promise.all(ids.map(async (id) => {
      const c = storeCoordsMap[id]
      const r = await api.get(`/orders/delivery-quote?storeLat=${c.lat}&storeLng=${c.lng}&lat=${addr.lat}&lng=${addr.lng}`)
      return { id, fee: Number(r.data?.deliveryFee) }
    })).then((rows) => {
      if (cancelled) return
      const map: Record<string, number> = {}
      for (const row of rows) if (Number.isFinite(row.fee)) map[row.id] = row.fee
      setStoreFeesMap(map)
      const all = ids.every(id => map[id] != null)
      setEstimatedFee(all ? Math.round(ids.reduce((s, id) => s + map[id], 0) * 100) / 100 : null)
    }).catch(() => { if (!cancelled) setEstimatedFee(null) })
    return () => { cancelled = true }
  }, [storeCoordsMap, storeIdsKey, selectedAddress, addresses])

  // Guest gate — after all hooks
  if (!user) {
    return (
      <View style={[styles.guestContainer, { paddingTop: insets.top }]}>
        <TouchableOpacity style={[styles.guestBack, { top: insets.top + 12 }]} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="close" size={20} color={TEXT} />
        </TouchableOpacity>
        <View style={styles.guestBody}>
          <View style={styles.guestIconWrap}>
            <Ionicons name="lock-closed-outline" size={36} color={PRIMARY} />
          </View>
          <Text style={styles.guestTitle}>Entre para finalizar</Text>
          <Text style={styles.guestSub}>
            Faça login ou crie uma conta para confirmar seu pedido. Seu carrinho será mantido.
          </Text>
          <TouchableOpacity style={styles.guestLoginBtn} onPress={() => router.push('/(auth)/login')} activeOpacity={0.85}>
            <Ionicons name="log-in-outline" size={20} color="#fff" />
            <Text style={styles.guestLoginText}>Entrar na conta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.guestRegisterBtn} onPress={() => router.push('/(auth)/register')} activeOpacity={0.85}>
            <Text style={styles.guestRegisterText}>Criar conta grátis</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const subtotal = total()
  // Totais do pedido (mesma função usada na validação do cupom → fonte única).
  const { deliveryKnown, deliveryFee, deliveryCharged, freeShipping, couponDiscount, promoDiscount, discount, orderTotal } = computeTotals(couponResults)

  const maxRedeemable = Math.floor(loyaltyPoints / 100) * 100  // multiples of 100
  function toggleLoyalty() {
    if (pointsToRedeem > 0) {
      setPointsToRedeem(0); setLoyaltyDiscount(0)
    } else if (maxRedeemable >= 100) {
      const pts = Math.min(maxRedeemable, 500) // max 500 pts per order
      const disc = (pts / 100) * 10
      setPointsToRedeem(pts); setLoyaltyDiscount(disc)
    }
  }
  const selectedPm = PAYMENT_METHODS.find((p) => p.value === paymentMethod) ?? PAYMENT_METHODS[0]
  const hasAddresses = addresses && addresses.length > 0

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Gera o device fingerprint do MP em background (antifraude do cartão) */}
      <MpDeviceWebView onDeviceId={setDeviceId} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Finalizar pedido</Text>
        <View style={styles.itemCountBadge}>
          <Text style={styles.itemCountText}>{items.length} {items.length === 1 ? 'item' : 'itens'}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Step 1: Entrega ou Retirada ── */}
        <View style={styles.stepHeader}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>1</Text>
          </View>
          <View style={styles.stepTitleWrap}>
            <Text style={styles.stepTitle}>{isPickup ? 'Retirada na loja' : 'Endereço de entrega'}</Text>
            <Text style={styles.stepSub}>{isPickup ? 'Você retira o pedido na loja' : 'Onde entregar seu pedido?'}</Text>
          </View>
        </View>

        {/* Alternar Entrega × Retirar na loja (trava em retirada quando passa do teto) */}
        <View style={styles.fulfillToggle}>
          <TouchableOpacity
            style={[styles.fulfillOption, !isPickup && styles.fulfillOptionActive, mustPickup && styles.fulfillOptionOff]}
            onPress={() => { if (!mustPickup) setPickupChosen(false) }}
            disabled={mustPickup}
            activeOpacity={0.85}
          >
            <Ionicons name="bicycle" size={18} color={!isPickup ? PRIMARY : MUTED} />
            <Text style={[styles.fulfillLabel, !isPickup && styles.fulfillLabelActive]}>Entrega</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fulfillOption, isPickup && styles.fulfillOptionActive]}
            onPress={() => setPickupChosen(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="storefront" size={18} color={isPickup ? PRIMARY : MUTED} />
            <Text style={[styles.fulfillLabel, isPickup && styles.fulfillLabelActive]}>Retirar na loja</Text>
          </TouchableOpacity>
        </View>

        {mustPickup && (
          <View style={styles.pickupNotice}>
            <Ionicons name="shield-checkmark" size={16} color={PRIMARY} />
            <Text style={styles.pickupNoticeText}>
              Pedidos acima de R$ {maxDeliveryValue.toFixed(0)} só com retirada na loja — por segurança, o motoboy não leva itens acima desse valor.
            </Text>
          </View>
        )}

        {/* ── Retirada na loja: onde buscar ── */}
        {isPickup && (
          <>
            {cartGroups.map((g) => {
              const info = storeInfoMap[g.storeId]
              return (
                <View key={g.storeId} style={styles.pickupCard}>
                  <View style={styles.pickupIconWrap}>
                    <Ionicons name="storefront" size={18} color={PRIMARY} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickupStoreName}>{info?.name ?? g.storeName}</Text>
                    <Text style={styles.pickupAddr}>{info?.address ?? 'Endereço disponível na tela do pedido'}</Text>
                    {info?.phone ? <Text style={styles.pickupPhone}>{info.phone}</Text> : null}
                  </View>
                </View>
              )
            })}
            <View style={styles.pickupHint}>
              <Ionicons name="key-outline" size={14} color={MUTED} />
              <Text style={styles.pickupHintText}>Ao chegar, mostre o código de retirada (aparece no seu pedido) para a loja liberar a entrega.</Text>
            </View>
            {!hasAddresses && (
              <TouchableOpacity style={styles.emptyAddress} onPress={() => setShowAddrSheet(true)} activeOpacity={0.85}>
                <View style={styles.emptyAddressIcon}>
                  <Ionicons name="person-outline" size={26} color={PRIMARY} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.emptyAddressTitle}>Cadastre um endereço</Text>
                  <Text style={styles.emptyAddressSub}>Necessário na sua conta para concluir</Text>
                </View>
                <View style={styles.addBadge}>
                  <Ionicons name="add" size={16} color={PRIMARY} />
                  <Text style={styles.addBadgeText}>Adicionar</Text>
                </View>
              </TouchableOpacity>
            )}
          </>
        )}

        {!isPickup && (!hasAddresses ? (
          <TouchableOpacity
            style={styles.emptyAddress}
            onPress={() => setShowAddrSheet(true)}
            activeOpacity={0.85}
          >
            <View style={styles.emptyAddressIcon}>
              <Ionicons name="location-outline" size={26} color={PRIMARY} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.emptyAddressTitle}>Nenhum endereço cadastrado</Text>
              <Text style={styles.emptyAddressSub}>Toque para adicionar agora</Text>
            </View>
            <View style={styles.addBadge}>
              <Ionicons name="add" size={16} color={PRIMARY} />
              <Text style={styles.addBadgeText}>Adicionar</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <>
            {addresses.map((addr) => {
              const isSelected = selectedAddress === addr.id
              return (
                <TouchableOpacity
                  key={addr.id}
                  style={[styles.addrCard, isSelected && styles.addrCardSelected]}
                  onPress={() => setSelectedAddress(addr.id)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.addrIconWrap, isSelected && styles.addrIconWrapSelected]}>
                    <Ionicons name="location" size={18} color={isSelected ? PRIMARY : MUTED} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.addrLabel, isSelected && styles.addrLabelSelected]}>
                      {addr.label}
                    </Text>
                    <Text style={styles.addrLine}>{addr.street}, {addr.number}</Text>
                    <Text style={styles.addrLine}>{addr.district} · {addr.city}</Text>
                  </View>
                  <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                </TouchableOpacity>
              )
            })}
            <TouchableOpacity
              style={styles.addAddrBtn}
              onPress={() => setShowAddrSheet(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={16} color={PRIMARY} />
              <Text style={styles.addAddrText}>Adicionar outro endereço</Text>
            </TouchableOpacity>
          </>
        ))}


        {/* ── Step 2: Pagamento ── */}
        <View style={[styles.stepHeader, { marginTop: 28 }]}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>2</Text>
          </View>
          <View style={styles.stepTitleWrap}>
            <Text style={styles.stepTitle}>Forma de pagamento</Text>
            <Text style={styles.stepSub}>Como vai pagar?</Text>
          </View>
        </View>

        <View style={styles.pmGrid}>
          {PAYMENT_METHODS.map((pm) => {
            const isSelected = paymentMethod === pm.value
            return (
              <TouchableOpacity
                key={pm.value}
                style={[styles.pmCard, isSelected && styles.pmCardSelected]}
                onPress={() => {
                  // Trocar de método = nova tentativa de pagamento → chave nova
                  // (senão o backend devolveria o pedido do método anterior).
                  if (pm.value !== paymentMethod) idemKey.current = genIdemKey()
                  setPaymentMethod(pm.value)
                  setInstallments(1) // reset installments when changing payment method
                }}
                activeOpacity={0.85}
              >
                {isSelected && (
                  <View style={styles.pmCheckmark}>
                    <Ionicons name="checkmark" size={10} color="#fff" />
                  </View>
                )}
                <View style={[styles.pmIconWrap, { backgroundColor: pm.iconBg }]}>
                  <Ionicons name={pm.icon as any} size={22} color={pm.iconColor} />
                </View>
                <Text style={[styles.pmLabel, isSelected && styles.pmLabelSelected]} numberOfLines={1}>
                  {pm.label}
                </Text>
                <Text style={styles.pmDesc} numberOfLines={1}>{pm.desc}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* ── PIX (Asaas): CPF do pagador ── */}
        {!isCard && asaasPix && (
          <View style={styles.cardForm}>
            <View style={styles.cardFormHeader}>
              <Ionicons name="flash" size={16} color={PRIMARY} />
              <Text style={styles.cardFormTitle}>Dados para o PIX</Text>
            </View>
            <Text style={styles.fieldLabel}>CPF do pagador <Text style={styles.fieldRequired}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={pixCpf}
              onChangeText={(v) => setPixCpf(formatCpf(v))}
              placeholder="000.000.000-00"
              placeholderTextColor={MUTED}
              keyboardType="numeric"
              maxLength={14}
            />
            <Text style={{ color: MUTED, fontSize: 12, marginTop: 6 }}>
              Necessário para gerar a cobrança PIX.
            </Text>
          </View>
        )}

        {/* ── Cartão via Checkout hospedado do Asaas (aviso; sem formulário aqui) ── */}
        {isCard && cardCheckout && (
          <View style={styles.cardForm}>
            <View style={styles.cardFormHeader}>
              <Ionicons name="card" size={16} color={PRIMARY} />
              <Text style={styles.cardFormTitle}>Pagamento seguro pelo Asaas</Text>
            </View>
            <Text style={{ color: MUTED, fontSize: 13, lineHeight: 18 }}>
              Ao finalizar, abriremos a página segura do Asaas para você informar os dados do cartão. Nenhum dado do cartão passa pelo Tá Barato.
            </Text>
          </View>
        )}

        {/* ── Card form ── */}
        {isCard && !cardCheckout && (
          <View style={styles.cardForm}>
            <View style={styles.cardFormHeader}>
              <Ionicons name="card" size={16} color={PRIMARY} />
              <Text style={styles.cardFormTitle}>Dados do cartão</Text>
            </View>

            {/* Saved card banner */}
            {savedCard && (
              <View style={styles.savedCardRow}>
                <Ionicons name={usingSavedCard ? 'checkbox' : 'square-outline'} size={20} color={PRIMARY} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.savedCardLabel}>{cardLabel(savedCard)}</Text>
                  <Text style={styles.savedCardSub}>
                    {usingSavedCard ? 'Digite apenas o CVV para usar' : 'Dados pré-preenchidos acima'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setUsingSavedCard(v => !v)}
                  style={styles.savedCardToggle}
                >
                  <Text style={styles.savedCardToggleText}>
                    {usingSavedCard ? 'Usar outro' : 'Usar salvo'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.fieldLabel}>Número do cartão <Text style={styles.fieldRequired}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={cardNumber}
              onChangeText={(v) => setCardNumber(formatCardNumber(v))}
              placeholder="0000 0000 0000 0000"
              placeholderTextColor={MUTED}
              keyboardType="numeric"
              maxLength={19}
            />

            <Text style={styles.fieldLabel}>Nome no cartão <Text style={styles.fieldRequired}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={cardHolder}
              onChangeText={setCardHolder}
              placeholder="Como aparece no cartão"
              placeholderTextColor={MUTED}
              autoCapitalize="characters"
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Validade <Text style={styles.fieldRequired}>*</Text></Text>
                <TextInput
                  style={styles.input}
                  value={cardExpiry}
                  onChangeText={(v) => setCardExpiry(formatExpiry(v))}
                  placeholder="MM/AA"
                  placeholderTextColor={MUTED}
                  keyboardType="numeric"
                  maxLength={5}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>CVV <Text style={styles.fieldRequired}>*</Text></Text>
                <TextInput
                  style={styles.input}
                  value={cardCvv}
                  onChangeText={(v) => setCardCvv(v.replace(/\D/g, '').slice(0, 4))}
                  placeholder="123"
                  placeholderTextColor={MUTED}
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>CPF do titular <Text style={styles.fieldRequired}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={cardCpf}
              onChangeText={(v) => setCardCpf(formatCpf(v))}
              placeholder="000.000.000-00"
              placeholderTextColor={MUTED}
              keyboardType="numeric"
              maxLength={14}
            />

            {isCard && (
              <>
                <Text style={styles.fieldLabel}>Parcelas</Text>
                <View style={styles.installmentsRow}>
                  {INSTALLMENT_OPTIONS.map((n) => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.installmentChip, installments === n && styles.installmentChipActive]}
                      onPress={() => setInstallments(n)}
                    >
                      <Text style={[styles.installmentText, installments === n && styles.installmentTextActive]}>
                        {n}x
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {installments > 1 && orderTotal > 0 && (
                  <Text style={styles.installmentHint}>
                    {installments}x de R$ {(orderTotal / installments).toFixed(2)} · total R$ {orderTotal.toFixed(2)}
                  </Text>
                )}
              </>
            )}
          </View>
        )}

        {/* ── Step 3: Resumo ── */}
        <View style={[styles.stepHeader, { marginTop: 28 }]}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>3</Text>
          </View>
          <View style={styles.stepTitleWrap}>
            <Text style={styles.stepTitle}>Resumo do pedido</Text>
            <Text style={styles.stepSub}>{items.length} {items.length === 1 ? 'produto' : 'produtos'}</Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          {items.map((item) => (
            <View key={`${item.product.id}-${item.variation?.id ?? ''}`} style={styles.summaryItemRow}>
              <View style={styles.summaryQtyBadge}>
                <Text style={styles.summaryQtyText}>{item.quantity}x</Text>
              </View>
              <Text style={styles.summaryItemName} numberOfLines={1}>{item.product.name}</Text>
              <Text style={styles.summaryItemPrice}>
                R$ {((item.variation?.price ?? item.product.basePrice ?? 0) * item.quantity).toFixed(2)}
              </Text>
            </View>
          ))}

          <View style={styles.summaryDivider} />

          {/* Cupom POR LOJA */}
          {cartGroups.map((g) => {
            const res = couponResults[g.storeId]
            const input = couponInputs[g.storeId] ?? ''
            const err = couponErrors[g.storeId]
            const checking = checkingStore === g.storeId
            return (
              <View key={g.storeId} style={{ marginBottom: 8 }}>
                {!singleStore && (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, marginBottom: 6, marginLeft: 4 }} numberOfLines={1}>
                    Cupom · {g.storeName}
                  </Text>
                )}
                {!res ? (
                  <View style={styles.couponRow}>
                    <TextInput
                      style={styles.couponInput}
                      placeholder="Código de cupom"
                      placeholderTextColor={MUTED}
                      value={input}
                      onChangeText={(t) => { setCouponInputs((i) => ({ ...i, [g.storeId]: t.toUpperCase() })); setCouponErrors((e) => ({ ...e, [g.storeId]: '' })) }}
                      autoCapitalize="characters"
                    />
                    <TouchableOpacity
                      style={[styles.couponBtn, (!input.trim() || checking) && styles.couponBtnDisabled]}
                      onPress={() => applyCoupon(g.storeId)}
                      disabled={!input.trim() || checking}
                      activeOpacity={0.85}
                    >
                      {checking
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.couponBtnText}>Aplicar</Text>
                      }
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.couponApplied}>
                    <View style={styles.couponAppliedLeft}>
                      <Ionicons name="ticket-outline" size={16} color={SUCCESS} />
                      <View>
                        <Text style={styles.couponAppliedCode}>{res.code}</Text>
                        {res.description ? <Text style={styles.couponAppliedDesc}>{res.description}</Text> : null}
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => removeCoupon(g.storeId)}>
                      <Ionicons name="close-circle" size={20} color={MUTED} />
                    </TouchableOpacity>
                  </View>
                )}
                {err ? <Text style={styles.couponError}>{err}</Text> : null}
              </View>
            )
          })}

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>R$ {subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryLabelRow}>
              <Ionicons name={isPickup ? 'storefront-outline' : 'bicycle-outline'} size={13} color={MUTED} />
              <Text style={styles.summaryLabel}>{isPickup ? 'Retirada na loja' : 'Entrega'}</Text>
            </View>
            {isPickup ? (
              <Text style={[styles.summaryValue, { color: SUCCESS, fontWeight: '800' }]}>Grátis</Text>
            ) : !deliveryKnown ? (
              <Text style={[styles.summaryValue, { color: MUTED, fontStyle: 'italic' }]}>a calcular</Text>
            ) : deliveryCharged < deliveryFee ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.summaryValue, { color: MUTED, textDecorationLine: 'line-through', fontSize: 13 }]}>R$ {deliveryFee.toFixed(2)}</Text>
                <Text style={[styles.summaryValue, { color: SUCCESS, fontWeight: '800' }]}>{deliveryCharged === 0 ? 'Grátis' : `R$ ${deliveryCharged.toFixed(2)}`}</Text>
              </View>
            ) : (
              <Text style={styles.summaryValue}>R$ {deliveryFee.toFixed(2)}{cartGroups.length > 1 ? ` (${cartGroups.length} entregas)` : ''}</Text>
            )}
          </View>
          {promoDiscount > 0 && (
            <View style={styles.summaryRow}>
              <View style={styles.summaryLabelRow}>
                <Ionicons name="pricetag-outline" size={13} color={SUCCESS} />
                <Text style={[styles.summaryLabel, { color: SUCCESS }]}>Promoções</Text>
              </View>
              <Text style={[styles.summaryValue, { color: SUCCESS, fontWeight: '700' }]}>-R$ {promoDiscount.toFixed(2)}</Text>
            </View>
          )}
          {(() => {
            // Desconto EFETIVO de cupom+fidelidade (capado ao que sobra após a promoção),
            // pra soma bater com o Total — nunca mostrar mais desconto do que o aplicado.
            const effCouponLoyalty = Math.max(0, Math.round((discount - promoDiscount) * 100) / 100)
            if (effCouponLoyalty <= 0) return null
            return (
              <View style={styles.summaryRow}>
                <View style={styles.summaryLabelRow}>
                  <Ionicons name="ticket-outline" size={13} color={SUCCESS} />
                  <Text style={[styles.summaryLabel, { color: SUCCESS }]}>Desconto</Text>
                </View>
                <Text style={[styles.summaryValue, { color: SUCCESS, fontWeight: '700' }]}>-R$ {effCouponLoyalty.toFixed(2)}</Text>
              </View>
            )
          })()}

          <View style={styles.summaryDivider} />

          <View style={styles.totalRow}>
            <View>
              <Text style={styles.totalLabel}>Total a pagar</Text>
              <Text style={styles.totalSub}>via {selectedPm.label}</Text>
            </View>
            <Text style={styles.totalValue}>R$ {orderTotal.toFixed(2)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Sticky confirm button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.bottomMeta}>
          <Text style={styles.bottomTotal}>R$ {orderTotal.toFixed(2)}</Text>
          <Text style={styles.bottomTotalSub}>{isPickup ? 'Total (retirada na loja)' : (deliveryKnown ? 'Total com entrega' : 'Calculando entrega…')}</Text>
        </View>
        <TouchableOpacity
          style={[styles.confirmBtn, (isPending || orderTotal <= 0 || !deliveryKnown) && styles.confirmBtnLoading]}
          onPress={handleConfirm}
          disabled={isPending || orderTotal <= 0 || !deliveryKnown}
          activeOpacity={0.88}
        >
          {isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : orderTotal <= 0 ? (
            <Text style={styles.confirmBtnText}>Remova um desconto (total R$ 0,00)</Text>
          ) : !deliveryKnown ? (
            // Sem o frete real não confirma — senão o backend cobra mais que o exibido.
            <Text style={styles.confirmBtnText}>Calculando entrega…</Text>
          ) : (
            <>
              <Text style={styles.confirmBtnText}>Confirmar pedido</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Custom Alert ── */}
      <AppAlert
        visible={!!alertConfig}
        type={alertConfig?.type ?? 'info'}
        title={alertConfig?.title ?? ''}
        message={alertConfig?.message}
        confirmText={alertConfig?.confirmText}
        cancelText={alertConfig?.cancelText}
        onConfirm={alertConfig?.onConfirm}
        onClose={hideAlert}
      />

      {/* ── Address Bottom Sheet ── */}
      <Modal
        visible={showAddrSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddrSheet(false)}
      >
        <KeyboardAvoidingView
          style={styles.sheetOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.sheetBackdrop} onPress={() => setShowAddrSheet(false)} />

          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            {/* Sheet header */}
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderLeft}>
                <View style={styles.sheetHeaderIcon}>
                  <Ionicons name="location" size={18} color={PRIMARY} />
                </View>
                <View>
                  <Text style={styles.sheetTitle}>Novo endereço</Text>
                  <Text style={styles.sheetSub}>Para entrega em Vilhena, RO</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowAddrSheet(false)} style={styles.sheetCloseBtn}>
                <Ionicons name="close" size={18} color={MUTED} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.sheetScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Label suggestions */}
              <Text style={styles.fieldLabel}>Identificação <Text style={styles.fieldRequired}>*</Text></Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.labelSuggestRow}>
                {LABEL_SUGGESTIONS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.labelChip, addrForm.label === s && styles.labelChipActive]}
                    onPress={() => setField('label')(s)}
                  >
                    <Text style={[styles.labelChipText, addrForm.label === s && styles.labelChipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TextInput
                style={styles.input}
                value={addrForm.label}
                onChangeText={setField('label')}
                placeholder="Ex: Casa da vovó"
                placeholderTextColor={MUTED}
              />

              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 1.2 }]}>
                  <Text style={styles.fieldLabel}>CEP <Text style={styles.fieldRequired}>*</Text></Text>
                  <View style={{ position: 'relative' }}>
                    <TextInput
                      style={styles.input}
                      value={addrForm.zipCode}
                      onChangeText={handleCepChange}
                      placeholder="76980-000"
                      placeholderTextColor={MUTED}
                      keyboardType="numeric"
                      maxLength={9}
                    />
                    {cepLoading && (
                      <ActivityIndicator
                        size="small"
                        color={PRIMARY}
                        style={{ position: 'absolute', right: 12, top: 14 }}
                      />
                    )}
                  </View>
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Número <Text style={styles.fieldRequired}>*</Text></Text>
                  <TextInput
                    style={styles.input}
                    value={addrForm.number}
                    onChangeText={setField('number')}
                    placeholder="123"
                    placeholderTextColor={MUTED}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Rua / Avenida <Text style={styles.fieldRequired}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={addrForm.street}
                onChangeText={setField('street')}
                placeholder="Ex: Av. Major Amarante"
                placeholderTextColor={MUTED}
              />

              <Text style={styles.fieldLabel}>Complemento</Text>
              <TextInput
                style={styles.input}
                value={addrForm.complement}
                onChangeText={setField('complement')}
                placeholder="Apto, bloco, referência..."
                placeholderTextColor={MUTED}
              />

              <Text style={styles.fieldLabel}>Bairro <Text style={styles.fieldRequired}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={addrForm.district}
                onChangeText={setField('district')}
                placeholder="Ex: Centro"
                placeholderTextColor={MUTED}
              />

              <View style={styles.row}>
                <View style={[styles.fieldGroup, { flex: 2 }]}>
                  <Text style={styles.fieldLabel}>Cidade <Text style={styles.fieldRequired}>*</Text></Text>
                  <TextInput
                    style={styles.input}
                    value={addrForm.city}
                    onChangeText={setField('city')}
                    placeholder="Vilhena"
                    placeholderTextColor={MUTED}
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Estado</Text>
                  <TextInput
                    style={[styles.input, styles.inputDisabled]}
                    value={addrForm.state}
                    editable={false}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveAddrBtn, savingAddr && styles.saveAddrBtnLoading]}
                onPress={handleSaveAddress}
                disabled={savingAddr}
                activeOpacity={0.88}
              >
                {savingAddr ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={styles.saveAddrBtnText}>Salvar e usar este endereço</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F0E8E2',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: TEXT, letterSpacing: -0.3 },
  itemCountBadge: { backgroundColor: PRIMARY_LIGHT, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  itemCountText: { fontSize: 12, fontWeight: '700', color: PRIMARY },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 20 },

  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  stepNumber: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: PRIMARY,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumberText: { fontSize: 13, fontWeight: '900', color: '#fff' },
  stepTitleWrap: {},
  stepTitle: { fontSize: 15, fontWeight: '800', color: TEXT, letterSpacing: -0.2 },
  stepSub: { fontSize: 12, color: MUTED, marginTop: 1 },

  // Empty address
  emptyAddress: {
    backgroundColor: CARD, borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1.5, borderColor: BORDER, borderStyle: 'dashed',
  },
  emptyAddressIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: PRIMARY_LIGHT,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyAddressTitle: { fontSize: 14, fontWeight: '700', color: TEXT },
  emptyAddressSub: { fontSize: 12, color: MUTED, marginTop: 2 },
  addBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: PRIMARY_LIGHT, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  addBadgeText: { fontSize: 12, fontWeight: '700', color: PRIMARY },

  // Address cards
  addrCard: {
    backgroundColor: CARD, borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    marginBottom: 8, borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  addrCardSelected: { borderColor: PRIMARY, backgroundColor: PRIMARY_LIGHT },
  addrIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F0E8E2',
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  addrIconWrapSelected: { backgroundColor: '#FFD9BF' },
  addrLabel: { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 3 },
  addrLabelSelected: { color: PRIMARY },
  addrLine: { fontSize: 12, color: MUTED, lineHeight: 18 },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  radioOuterSelected: { borderColor: PRIMARY },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: PRIMARY },

  addAddrBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 4, marginTop: 2,
  },
  addAddrText: { fontSize: 13, fontWeight: '700', color: PRIMARY },

  // ── Entrega × Retirada ──
  fulfillToggle: {
    flexDirection: 'row', gap: 8, marginBottom: 12,
  },
  fulfillOption: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12,
    backgroundColor: CARD, borderWidth: 2, borderColor: BORDER,
  },
  fulfillOptionActive: { borderColor: PRIMARY, backgroundColor: PRIMARY_LIGHT },
  fulfillOptionOff: { opacity: 0.4 },
  fulfillLabel: { fontSize: 14, fontWeight: '700', color: MUTED },
  fulfillLabelActive: { color: PRIMARY },
  pickupNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: PRIMARY_LIGHT, borderRadius: 12, padding: 12, marginBottom: 12,
  },
  pickupNoticeText: { flex: 1, fontSize: 12.5, color: TEXT, lineHeight: 18 },
  pickupCard: {
    backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    borderWidth: 1.5, borderColor: BORDER,
  },
  pickupIconWrap: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: PRIMARY_LIGHT,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  pickupStoreName: { fontSize: 14, fontWeight: '700', color: TEXT, marginBottom: 3 },
  pickupAddr: { fontSize: 12.5, color: MUTED, lineHeight: 18 },
  pickupPhone: { fontSize: 12.5, color: MUTED, marginTop: 2 },
  pickupHint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    paddingHorizontal: 4, paddingVertical: 8, marginBottom: 2,
  },
  pickupHintText: { flex: 1, fontSize: 12, color: MUTED, lineHeight: 17 },

  // Card form
  cardForm: {
    backgroundColor: CARD, borderRadius: 16, padding: 16,
    marginTop: 12, borderWidth: 1.5, borderColor: '#DBEAFE',
    shadowColor: '#2563EB', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardFormHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardFormTitle: { fontSize: 14, fontWeight: '800', color: TEXT },
  savedCardRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF0EB', borderRadius: 12, padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: '#FFD5B8',
  },
  savedCardLabel: { fontSize: 13, fontWeight: '800', color: TEXT },
  savedCardSub: { fontSize: 11, color: MUTED, marginTop: 1 },
  savedCardToggle: { backgroundColor: PRIMARY, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  savedCardToggleText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // Schedule
  scheduleCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 16,
    marginTop: 16, borderWidth: 1.5, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  scheduleToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scheduleToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  scheduleToggleTitle: { fontSize: 14, fontWeight: '800', color: TEXT },
  scheduleToggleSub: { fontSize: 11, color: MUTED, marginTop: 1 },
  scheduleSwitch: {
    width: 44, height: 24, borderRadius: 12,
    backgroundColor: '#E0D8D0', justifyContent: 'center', padding: 2,
  },
  scheduleSwitchOn: { backgroundColor: PRIMARY },
  scheduleSwitchKnob: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, elevation: 2,
  },
  scheduleSwitchKnobOn: { alignSelf: 'flex-end' },
  scheduleFields: { flexDirection: 'row', gap: 12, marginTop: 16 },

  installmentsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' as const, marginTop: 4 },
  installmentHint: { fontSize: 12, color: MUTED, fontWeight: '600', marginTop: 8 },
  installmentChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: BORDER, backgroundColor: CARD,
  },
  installmentChipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  installmentText: { fontSize: 13, fontWeight: '700', color: MUTED },
  installmentTextActive: { color: '#fff' },

  // Payment grid
  pmGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pmCard: {
    width: '47.5%', backgroundColor: CARD, borderRadius: 16, padding: 14,
    borderWidth: 2, borderColor: 'transparent', position: 'relative',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  pmCardSelected: { borderColor: PRIMARY, backgroundColor: PRIMARY_LIGHT },
  pmCheckmark: {
    position: 'absolute', top: 10, right: 10,
    width: 18, height: 18, borderRadius: 9, backgroundColor: PRIMARY,
    alignItems: 'center', justifyContent: 'center',
  },
  pmIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  pmLabel: { fontSize: 13, fontWeight: '800', color: TEXT, marginBottom: 3 },
  pmLabelSelected: { color: PRIMARY },
  pmDesc: { fontSize: 11, color: MUTED },

  // Summary
  summaryCard: {
    backgroundColor: CARD, borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3, marginBottom: 8,
  },
  summaryItemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  summaryQtyBadge: {
    backgroundColor: '#F0E8E2', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3, minWidth: 30, alignItems: 'center',
  },
  summaryQtyText: { fontSize: 12, fontWeight: '700', color: MUTED },
  summaryItemName: { flex: 1, fontSize: 13, fontWeight: '600', color: TEXT },
  summaryItemPrice: { fontSize: 13, fontWeight: '700', color: TEXT },
  summaryDivider: { height: 1, backgroundColor: BORDER, marginVertical: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  summaryLabel: { fontSize: 13, color: MUTED, fontWeight: '500' },
  summaryValue: { fontSize: 13, color: TEXT, fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 15, fontWeight: '800', color: TEXT },
  totalSub: { fontSize: 11, color: MUTED, marginTop: 2 },
  totalValue: { fontSize: 22, fontWeight: '900', color: PRIMARY, letterSpacing: -0.5 },

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER,
    paddingHorizontal: 16, paddingTop: 14,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 12,
  },
  bottomMeta: {},
  bottomTotal: { fontSize: 18, fontWeight: '900', color: TEXT, letterSpacing: -0.4 },
  bottomTotalSub: { fontSize: 11, color: MUTED, marginTop: 1 },
  confirmBtn: {
    flex: 1, flexDirection: 'row', backgroundColor: PRIMARY,
    borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  confirmBtnLoading: { opacity: 0.75 },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },

  // Address bottom sheet
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: CARD,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#DDD', alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  sheetHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetHeaderIcon: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: PRIMARY_LIGHT,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: TEXT },
  sheetSub: { fontSize: 12, color: MUTED, marginTop: 1 },
  sheetCloseBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#F0E8E2',
    alignItems: 'center', justifyContent: 'center',
  },
  sheetScroll: { paddingHorizontal: 20, paddingTop: 16 },

  // Form fields
  fieldLabel: { fontSize: 12, fontWeight: '700', color: MUTED, marginBottom: 6, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldRequired: { color: PRIMARY },
  input: {
    backgroundColor: BG, borderRadius: 12,
    borderWidth: 1.5, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: TEXT, fontWeight: '500',
  },
  inputDisabled: { color: MUTED, backgroundColor: '#F5EEE9' },
  row: { flexDirection: 'row', gap: 10 },
  fieldGroup: {},

  labelSuggestRow: { marginBottom: 8 },
  labelChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: CARD, marginRight: 8,
  },
  labelChipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  labelChipText: { fontSize: 13, fontWeight: '600', color: MUTED },
  labelChipTextActive: { color: '#fff' },

  saveAddrBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: PRIMARY, borderRadius: 14,
    paddingVertical: 15, marginTop: 24, marginBottom: 8,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  saveAddrBtnLoading: { opacity: 0.75 },
  saveAddrBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  // Coupon
  couponRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  couponInput: {
    flex: 1, height: 40, borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 10, paddingHorizontal: 12,
    fontSize: 14, fontWeight: '700', color: TEXT, letterSpacing: 1,
  },
  couponBtn: {
    backgroundColor: PRIMARY, borderRadius: 10,
    paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', height: 40,
  },
  couponBtnDisabled: { opacity: 0.5 },
  couponBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  couponApplied: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 14, marginVertical: 10,
    backgroundColor: '#F0FDF4', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  couponAppliedLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  couponAppliedCode: { fontSize: 13, fontWeight: '800', color: SUCCESS },
  couponAppliedDesc: { fontSize: 11, color: '#16A34A', marginTop: 1 },
  couponError: { fontSize: 12, color: '#DC2626', paddingHorizontal: 14, marginBottom: 6, marginTop: -4 },

  // Guest gate
  guestContainer: { flex: 1, backgroundColor: BG },
  guestBack: {
    position: 'absolute', right: 16, zIndex: 10,
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F0E8E2', alignItems: 'center', justifyContent: 'center',
  },
  guestBody: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  guestIconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: PRIMARY_LIGHT,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  guestTitle: { fontSize: 22, fontWeight: '900', color: TEXT, marginBottom: 10, textAlign: 'center' },
  guestSub: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 21, marginBottom: 32 },
  guestLoginBtn: {
    backgroundColor: PRIMARY, borderRadius: 14,
    paddingVertical: 15, width: '100%', alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    marginBottom: 12,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  guestLoginText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  guestRegisterBtn: {
    borderWidth: 2, borderColor: PRIMARY, borderRadius: 14,
    paddingVertical: 14, width: '100%', alignItems: 'center',
  },
  guestRegisterText: { color: PRIMARY, fontSize: 16, fontWeight: '700' },
})
