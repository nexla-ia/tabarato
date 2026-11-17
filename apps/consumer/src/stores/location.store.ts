import { create } from 'zustand'
import { Platform } from 'react-native'
import * as Location from 'expo-location'
import { regionToUf } from '../utils/uf'

/**
 * Onde o cliente está AGORA (GPS), separado da cidade do cadastro.
 *
 * Antes a home lia o GPS uma vez, em silêncio, e só se a permissão já existisse:
 * quem viajava (Vilhena → Cacoal) continuava vendo a cidade do cadastro e o app
 * nunca pedia para ligar a localização de novo. Agora atualiza ao abrir e ao
 * voltar para o app, e pede a permissão / o GPS quando faltam.
 */
export type SituacaoLocal =
  | 'parado'        // ainda não tentou
  | 'buscando'
  | 'ok'
  | 'negada'        // permissão recusada
  | 'gps-desligado' // permissão ok, mas a localização do aparelho está desligada
  | 'erro'          // não achou posição (sem sinal, tempo esgotado)

interface LocalState {
  situacao: SituacaoLocal
  coords?: { lat: number; lng: number }
  cidade?: string
  uf?: string
  /** false = o sistema não mostra mais o pedido; só pelas configurações. */
  podePedir: boolean
  atualizadoEm: number
  /**
   * `pedir`: pode mostrar o pedido de permissão e o de ligar o GPS (abrir o app,
   * tocar em "Ativar"). Sem ele só lê o que já está liberado (voltar ao app).
   */
  atualizar: (opts?: { pedir?: boolean; forcar?: boolean }) => Promise<void>
}

/** Não refaz a busca se a última posição tem menos que isso (evita gastar bateria). */
const VALIDADE_MS = 2 * 60 * 1000
const TEMPO_MAX_GPS_MS = 12_000

let emAndamento: Promise<void> | null = null

async function posicaoAtual(): Promise<Location.LocationObject | null> {
  // getCurrentPositionAsync pode demorar muito sem sinal; a última posição
  // conhecida (até 10 min) serve de reserva.
  const atual = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
  const limite = new Promise<null>((r) => setTimeout(() => r(null), TEMPO_MAX_GPS_MS))
  try {
    const pos = await Promise.race([atual, limite])
    if (pos) return pos
  } catch {}
  return Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 }).catch(() => null)
}

export const useLocationStore = create<LocalState>()((set, get) => ({
  situacao: 'parado',
  podePedir: true,
  atualizadoEm: 0,

  atualizar: async ({ pedir = false, forcar = false } = {}) => {
    if (emAndamento) return emAndamento
    const { situacao, atualizadoEm } = get()
    if (!forcar && situacao === 'ok' && Date.now() - atualizadoEm < VALIDADE_MS) return

    emAndamento = (async () => {
      set({ situacao: get().coords ? get().situacao : 'buscando' })
      try {
        let perm = await Location.getForegroundPermissionsAsync()
        if (perm.status !== 'granted' && pedir && perm.canAskAgain) {
          perm = await Location.requestForegroundPermissionsAsync()
        }
        if (perm.status !== 'granted') {
          set({ situacao: 'negada', podePedir: perm.canAskAgain })
          return
        }
        set({ podePedir: true })

        let gpsLigado = await Location.hasServicesEnabledAsync()
        if (!gpsLigado && pedir && Platform.OS === 'android') {
          // Mostra o aviso do Android "Ativar localização?" sem sair do app.
          try {
            await Location.enableNetworkProviderAsync()
            gpsLigado = await Location.hasServicesEnabledAsync()
          } catch {}
        }
        if (!gpsLigado) {
          set({ situacao: 'gps-desligado' })
          return
        }

        const pos = await posicaoAtual()
        if (!pos) {
          set({ situacao: 'erro' })
          return
        }
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }

        let cidade = get().cidade
        let uf = get().uf
        try {
          const [lugar] = await Location.reverseGeocodeAsync({ latitude: coords.lat, longitude: coords.lng })
          if (lugar) {
            cidade = lugar.city || lugar.subregion || lugar.district || cidade
            uf = regionToUf(lugar.region) ?? uf
          }
        } catch {} // sem nome da cidade, as coordenadas ainda servem para as lojas

        set({ situacao: 'ok', coords, cidade, uf, atualizadoEm: Date.now() })
      } catch {
        set({ situacao: 'erro' })
      }
    })()

    try { await emAndamento } finally { emAndamento = null }
  },
}))
