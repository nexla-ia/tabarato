import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>
  /** Compatibilidade com TouchableOpacity; ignorado (o toque afunda o botão). */
  activeOpacity?: number
}

/**
 * Botão que afunda ao toque. Substitui o TouchableOpacity em peças com
 * `relevo.*`: ao pressionar, o lábio (borda inferior) encolhe e a face desce o
 * mesmo tanto, sem empurrar o que está em volta (a margem de baixo compensa).
 */
export function Relevo({ style, disabled, children, activeOpacity: _ignorado, ...rest }: Props) {
  const base = StyleSheet.flatten(style) ?? {}
  const labio = typeof base.borderBottomWidth === 'number' ? base.borderBottomWidth : 0
  const afunda = Math.max(labio - 1, 0)
  const margemBaixo = [base.marginBottom, base.marginVertical, base.margin].find((m) => typeof m === 'number') as number | undefined

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      style={({ pressed }) => [
        base,
        pressed && afunda > 0 && {
          borderBottomWidth: labio - afunda,
          marginBottom: (margemBaixo ?? 0) + afunda,
          transform: [{ translateY: afunda }],
          shadowOpacity: 0.08,
          shadowOffset: { width: 0, height: 1 },
          elevation: 1,
        },
        pressed && afunda === 0 && { opacity: 0.85 },
      ]}
    >
      {children}
    </Pressable>
  )
}
