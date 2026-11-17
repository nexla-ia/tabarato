import { ReactNode, useEffect, useRef, useState } from 'react'
import {
  View, Text, Image, ScrollView, Modal, TouchableOpacity, StyleSheet,
  useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/** Limite de fotos por produto (capa + 2). O site do lojista usa o mesmo. */
export const MAX_FOTOS_PRODUTO = 3

/**
 * Fotos de um produto na ordem de exibição: a capa (`imageUrl`) primeiro,
 * depois a galeria (`images`), sem repetir e no máximo MAX_FOTOS_PRODUTO.
 */
export function fotosDoProduto(p: { imageUrl?: string | null; images?: string[] | null }): string[] {
  const todas = [p.imageUrl, ...(p.images ?? [])].filter((u): u is string => !!u)
  return Array.from(new Set(todas)).slice(0, MAX_FOTOS_PRODUTO)
}

/** Bolinhas de posição; some quando só há uma foto. */
function Pontos({ total, atual, claro }: { total: number; atual: number; claro?: boolean }) {
  if (total < 2) return null
  return (
    <View style={g.pontos} pointerEvents="none">
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            g.ponto,
            claro ? g.pontoClaro : g.pontoEscuro,
            i === atual && (claro ? g.pontoAtivoClaro : g.pontoAtivoEscuro),
          ]}
        />
      ))}
    </View>
  )
}

/**
 * Carrossel de fotos (arrasta para o lado). Tocar numa foto chama `onPress`
 * com o índice — usado para abrir a foto em tela cheia.
 */
export function GaleriaFotos({
  fotos, altura, largura, onPress,
}: {
  fotos: string[]
  altura: number
  /** Largura do carrossel; padrão = largura da tela. */
  largura?: number
  onPress?: (index: number) => void
}) {
  const tela = useWindowDimensions()
  const w = largura ?? tela.width
  const [atual, setAtual] = useState(0)

  function aoRolar(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setAtual(Math.round(e.nativeEvent.contentOffset.x / w))
  }

  return (
    <View style={{ width: w, height: altura, backgroundColor: '#fff' }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={aoRolar}
        scrollEnabled={fotos.length > 1}
      >
        {fotos.map((uri, i) => (
          <TouchableOpacity key={uri} activeOpacity={0.95} disabled={!onPress} onPress={() => onPress?.(i)}>
            <Image source={{ uri }} style={{ width: w, height: altura }} resizeMode="contain" />
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Pontos total={fotos.length} atual={atual} />
      {fotos.length > 1 && (
        <View style={g.contador} pointerEvents="none">
          <Ionicons name="images-outline" size={12} color="#fff" />
          <Text style={g.contadorTexto}>{atual + 1}/{fotos.length}</Text>
        </View>
      )}
    </View>
  )
}

/**
 * Foto em tela cheia, com fundo escuro e arraste entre as fotos.
 * `rodape` recebe o índice visível — para ações como "Editar" ou "Usar como capa".
 */
export function VisualizadorFotos({
  fotos, inicial = 0, visivel, onFechar, titulo, rodape,
}: {
  fotos: string[]
  inicial?: number
  visivel: boolean
  onFechar: () => void
  titulo?: string
  rodape?: (index: number) => ReactNode
}) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [atual, setAtual] = useState(inicial)
  const scroll = useRef<ScrollView>(null)

  useEffect(() => {
    if (!visivel) return
    setAtual(inicial)
    // Espera o layout do modal para pular direto para a foto tocada.
    const t = setTimeout(() => scroll.current?.scrollTo({ x: inicial * width, animated: false }), 0)
    return () => clearTimeout(t)
  }, [visivel, inicial, width])

  const indice = Math.min(atual, Math.max(0, fotos.length - 1))

  return (
    <Modal visible={visivel} animationType="fade" transparent statusBarTranslucent onRequestClose={onFechar}>
      <View style={v.fundo}>
        <View style={[v.topo, { paddingTop: insets.top + 8 }]}>
          <Text style={v.titulo} numberOfLines={1}>
            {titulo ?? ''}{fotos.length > 1 ? `${titulo ? ' · ' : ''}${indice + 1}/${fotos.length}` : ''}
          </Text>
          <TouchableOpacity style={v.fechar} onPress={onFechar} hitSlop={10} activeOpacity={0.8}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scroll}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setAtual(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={{ flex: 1 }}
        >
          {fotos.map((uri) => (
            <View key={uri} style={{ width, height: '100%', justifyContent: 'center', padding: 12 }}>
              <Image source={{ uri }} style={{ width: width - 24, height: height * 0.62, borderRadius: 14, backgroundColor: '#fff' }} resizeMode="contain" />
            </View>
          ))}
        </ScrollView>

        <View style={{ height: 24 }}>
          <Pontos total={fotos.length} atual={indice} claro />
        </View>
        {rodape && (
          <View style={[v.rodape, { paddingBottom: insets.bottom + 16 }]}>{rodape(indice)}</View>
        )}
        {!rodape && <View style={{ height: insets.bottom + 24 }} />}
      </View>
    </Modal>
  )
}

const g = StyleSheet.create({
  pontos: {
    position: 'absolute', bottom: 10, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  ponto: { width: 7, height: 7, borderRadius: 4 },
  pontoEscuro: { backgroundColor: 'rgba(26,10,0,0.18)' },
  pontoAtivoEscuro: { backgroundColor: '#FF5500', width: 18 },
  pontoClaro: { backgroundColor: 'rgba(255,255,255,0.35)' },
  pontoAtivoClaro: { backgroundColor: '#fff', width: 18 },
  contador: {
    position: 'absolute', top: 12, left: 12,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(26,10,0,0.55)', borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  contadorTexto: { color: '#fff', fontSize: 11, fontWeight: '800' },
})

const v = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(14,6,2,0.96)' },
  topo: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 8,
  },
  titulo: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '800' },
  fechar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  rodape: { paddingHorizontal: 16, paddingTop: 18, flexDirection: 'row', gap: 10 },
})
