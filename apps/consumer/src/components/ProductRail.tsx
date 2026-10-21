import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { colors } from '../theme/colors'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

interface RailProduct {
  id: string
  name: string
  imageUrl?: string | null
  basePrice?: number | string | null
  comparePrice?: number | string | null
  descontoPct?: number
  storeId: string
  store?: { name?: string } | null
}

const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

/**
 * Trilho horizontal da home: Ofertas Imperdíveis e Destaques da Semana.
 *
 * Some por completo quando a API devolve vazio, e não mostra esqueleto de
 * carregamento. São seções secundárias — piscar uma prateleira vazia no topo
 * da home a cada abertura incomoda mais do que ajuda. Os Destaques, em
 * especial, olham só os últimos 7 dias e vão passar semanas sem conteúdo
 * enquanto o volume de pedidos for baixo.
 */
export function ProductRail({
  rota,
  chave,
  titulo,
  subtitulo,
  icone,
}: {
  rota: string
  /** Parte da queryKey — precisa ser única por trilho. */
  chave: string
  titulo: string
  subtitulo: string
  icone: IoniconName
}) {
  const { data: produtos = [] } = useQuery<RailProduct[]>({
    queryKey: ['rail', chave],
    queryFn: async () => (await api.get(`${rota}?limit=12`)).data,
    staleTime: 2 * 60_000,
    // Falhar aqui não pode estragar a home: sem dado, a seção simplesmente
    // não aparece.
    retry: 1,
  })

  if (produtos.length === 0) return null

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <View style={s.tituloLinha}>
          <Ionicons name={icone} size={17} color={colors.primary} />
          <Text style={s.titulo}>{titulo}</Text>
        </View>
        <Text style={s.sub}>{subtitulo}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.scroll}
      >
        {produtos.map((p) => {
          const por = Number(p.basePrice ?? 0)
          const de = p.comparePrice != null ? Number(p.comparePrice) : null
          const temOferta = de != null && de > por
          const pct = p.descontoPct ?? (temOferta ? Math.round(((de - por) / de) * 100) : 0)

          return (
            <TouchableOpacity
              key={p.id}
              style={s.card}
              activeOpacity={0.85}
              // Nao existe rota de produto isolada no app: o caminho e a pagina
              // da loja, igual ao resto da vitrine.
              onPress={() => router.push(`/store/${p.storeId}` as any)}
            >
              <View style={s.imgWrap}>
                {p.imageUrl
                  ? <Image source={{ uri: p.imageUrl }} style={s.img} resizeMode="cover" />
                  : <View style={s.imgFallback}>
                      <Ionicons name="image-outline" size={22} color="#C8B8B0" />
                    </View>}
                {temOferta && (
                  <View style={s.selo}>
                    <Text style={s.seloTexto}>−{pct}%</Text>
                  </View>
                )}
              </View>

              <Text style={s.nome} numberOfLines={2}>{p.name}</Text>
              {!!p.store?.name && <Text style={s.loja} numberOfLines={1}>{p.store.name}</Text>}

              <View style={s.precos}>
                {temOferta && <Text style={s.de}>{brl(de)}</Text>}
                <Text style={s.por}>{brl(por)}</Text>
              </View>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { marginTop: 18 },
  header: { paddingHorizontal: 16, marginBottom: 10 },
  tituloLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titulo: { fontSize: 17, fontWeight: '900', color: '#1A0A00', letterSpacing: -0.2 },
  sub: { fontSize: 12.5, color: '#9A8880', marginTop: 2 },

  scroll: { paddingHorizontal: 16, gap: 12 },

  card: { width: 148 },
  imgWrap: {
    width: 148, height: 108, borderRadius: 14, overflow: 'hidden',
    backgroundColor: '#F5EEE9', marginBottom: 7, position: 'relative',
  },
  img: { width: '100%', height: '100%' },
  imgFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  selo: {
    position: 'absolute', top: 7, left: 7,
    backgroundColor: '#DC2626', borderRadius: 999,
    paddingHorizontal: 7, paddingVertical: 2.5,
  },
  seloTexto: { color: '#fff', fontSize: 11.5, fontWeight: '800' },

  nome: { fontSize: 13.5, fontWeight: '700', color: '#1A0A00', lineHeight: 18 },
  loja: { fontSize: 11.5, color: '#9A8880', marginTop: 1 },

  precos: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  de: { fontSize: 12, color: '#BBA898', textDecorationLine: 'line-through' },
  por: { fontSize: 15, fontWeight: '900', color: colors.primary },
})
