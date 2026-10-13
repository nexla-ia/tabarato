import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../theme/colors'

/**
 * Estado de ERRO de carregamento.
 *
 * Existe porque vários `.catch(() => {})` faziam a tela cair no estado vazio
 * ("você não tem nenhum pedido") quando na verdade a rede falhou — o usuário
 * acreditava ter perdido os dados. Falha de rede e lista vazia são coisas
 * diferentes e precisam parecer diferentes.
 */
export function LoadError({
  onRetry,
  title = 'Não foi possível carregar',
  sub = 'Verifique sua conexão e tente novamente.',
}: {
  onRetry: () => void
  title?: string
  sub?: string
}) {
  return (
    <View style={s.wrap}>
      <Ionicons name="cloud-offline-outline" size={48} color="#9A8880" />
      <Text style={s.title}>{title}</Text>
      <Text style={s.sub}>{sub}</Text>
      <TouchableOpacity onPress={onRetry} style={s.btn} activeOpacity={0.85}>
        <Text style={s.btnText}>Tentar novamente</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 60, gap: 10 },
  title: { fontSize: 16, fontWeight: '800', color: '#1A0A00', marginTop: 4 },
  sub: { fontSize: 13.5, color: '#9A8880', textAlign: 'center', lineHeight: 19, marginBottom: 6 },
  btn: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 11 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
})
