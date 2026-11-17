import { View, StyleProp, ViewStyle } from 'react-native'

/**
 * O "T" do Tá Barato em marca d'água, para o fundo dos cards de destaque.
 *
 * Desenhado com duas Views (barra + haste) que NÃO se sobrepõem: com cor
 * translúcida, a sobreposição sairia mais escura no encontro das duas.
 * Fica inclinado como o T do logo. `pointerEvents="none"` para nunca
 * roubar o toque do conteúdo do card.
 */
export function MarcaT({
  size = 200,
  color = 'rgba(255,255,255,0.10)',
  style,
}: {
  /** Altura do T, em pontos. */
  size?: number
  /** Cor já com a transparência (ex.: branco 10% em card laranja). */
  color?: string
  /** Posição absoluta dentro do card (top/right/bottom/left). */
  style?: StyleProp<ViewStyle>
}) {
  const barH = size * 0.3
  const stemW = size * 0.36
  const r = size * 0.08
  return (
    <View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: size * 0.92, height: size, transform: [{ rotate: '-9deg' }] },
        style,
      ]}
    >
      <View style={{ height: barH, borderRadius: r, backgroundColor: color }} />
      <View
        style={{
          alignSelf: 'center',
          width: stemW,
          height: size - barH,
          backgroundColor: color,
          borderBottomLeftRadius: r,
          borderBottomRightRadius: r,
        }}
      />
    </View>
  )
}
