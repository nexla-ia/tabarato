import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { router } from 'expo-router'
import { api } from '../api/client'

const isExpoGo = Constants.appOwnership === 'expo'

async function getN() {
  if (isExpoGo) return null
  return import('expo-notifications')
}

export async function setupNotificationHandler() {
  const N = await getN()
  if (!N) return
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })
}

/**
 * Trata o TOQUE numa notificação (push ou da bandeja): abre o pedido relacionado.
 * Cobre o app já aberto (listener) e o cold-start (getLastNotificationResponse).
 * Antes, tocar numa notificação abria o app mas não navegava ("não fazia nada").
 */
export async function setupNotificationTapHandler() {
  const N = await getN()
  if (!N) return
  const handle = (data: any) => {
    // Nova corrida ou aviso de cadastro do entregador → abre a aba do entregador
    // (a oferta aparece pelo socket/poll ao entrar na home).
    if (data?.type === 'NEW_DELIVERY' || data?.screen === 'courier') {
      router.push('/(courier-tabs)' as any)
      return
    }
    if (data?.orderId) router.push(`/order/${data.orderId}` as any)
  }
  try {
    const last = await N.getLastNotificationResponseAsync()
    if (last) handle(last.notification.request.content.data)
  } catch {}
  N.addNotificationResponseReceivedListener((resp) => {
    handle(resp.notification.request.content.data)
  })
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Constants.isDevice || isExpoGo) return null

  const N = await getN()
  if (!N) return null

  const { status: existing } = await N.getPermissionsAsync()
  let finalStatus = existing

  if (existing !== 'granted') {
    const { status } = await N.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return null

  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('default', {
      name: 'Pedidos',
      importance: N.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF5500',
    })
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId
  const token = (await N.getExpoPushTokenAsync({ projectId })).data
  return token
}

export async function syncPushToken() {
  try {
    const token = await registerForPushNotifications()
    if (token) {
      await api.put('/users/me/push-token', { token })
    }
  } catch {
    // Best-effort
  }
}
