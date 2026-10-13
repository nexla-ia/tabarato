import * as TaskManager from 'expo-task-manager'
import * as Location from 'expo-location'
import * as SecureStore from 'expo-secure-store'

// Task de localização em SEGUNDO PLANO do entregador. Enquanto ele estiver ONLINE,
// a posição continua sendo enviada mesmo com o app minimizado / tela apagada — sem
// isso o cliente perde o rastreamento e o matching perde a posição real.
export const COURIER_LOCATION_TASK = 'tabarato-courier-location'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000/api'

// defineTask precisa rodar no escopo do módulo (registrado no boot) para o SO
// conseguir reentregar a task em background/headless. Usa fetch puro (não o axios
// com interceptors/refresh) — mais simples e seguro fora do ciclo de vida do app.
TaskManager.defineTask(COURIER_LOCATION_TASK, async ({ data, error }: any) => {
  if (error) return
  const locations = data?.locations as Array<{ coords: { latitude: number; longitude: number } }> | undefined
  const last = locations?.[locations.length - 1]
  if (!last) return
  try {
    const token = await SecureStore.getItemAsync('access_token')
    if (!token) return
    await fetch(`${API_URL}/couriers/me/location`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ lat: last.coords.latitude, lng: last.coords.longitude }),
    })
  } catch {
    // Sem rede em background: ignora; a próxima atualização reenvia.
  }
})

/** Liga o rastreamento em segundo plano (idempotente). Requer permissão de
 *  localização já concedida — chame após pedir foreground (+ background). */
export async function startCourierLocationUpdates(): Promise<void> {
  const already = await Location.hasStartedLocationUpdatesAsync(COURIER_LOCATION_TASK).catch(() => false)
  if (already) return
  await Location.startLocationUpdatesAsync(COURIER_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 20_000,
    distanceInterval: 50,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true, // iOS: barra azul de localização ativa
    foregroundService: {
      notificationTitle: 'Tá Barato — Você está online',
      notificationBody: 'Compartilhando sua localização para receber e acompanhar entregas.',
      notificationColor: '#FF5500',
    },
  })
}

/** Desliga o rastreamento em segundo plano (idempotente). Chamar ao ficar offline. */
export async function stopCourierLocationUpdates(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(COURIER_LOCATION_TASK).catch(() => false)
  if (started) await Location.stopLocationUpdatesAsync(COURIER_LOCATION_TASK).catch(() => {})
}
