import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../theme/colors'

/**
 * Cortesia da Bíblia, oferecida logo depois de criar a conta.
 *
 * Duas decisões que vêm da LGPD, não de estética:
 *
 * 1. As duas respostas têm o mesmo peso visual. "Não, obrigado" não é link
 *    apagado nem texto pequeno — consentimento para dado sensível precisa ser
 *    livre, e botão de recusa escondido é o oposto disso.
 * 2. O texto diz o que acontece com o aceite (nome e endereço vão para a
 *    plataforma preparar a postagem). Consentimento sem finalidade declarada
 *    não vale.
 *
 * Não tem botão de fechar no canto: o modal só sai por uma das duas respostas,
 * senão a pergunta voltaria no próximo login e viraria insistência.
 */
export function BibleOfferModal({
  visible,
  saving,
  onAnswer,
}: {
  visible: boolean
  saving: boolean
  onAnswer: (accepted: boolean) => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="book-outline" size={26} color={colors.primary} />
          </View>

          <Text style={styles.title}>O Tá Barato tem um presente para você!</Text>

          <Text style={styles.pergunta}>
            Você quer ganhar um exemplar da Bíblia sem custo?
          </Text>

          <View style={styles.lista}>
            <Text style={styles.item}>{'\u2022'}  O envio será gratuito via Correios.</Text>
            <Text style={styles.item}>
              {'\u2022'}  Seus dados cadastrados serão usados exclusivamente para esta entrega.
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost]}
              onPress={() => onAnswer(false)}
              disabled={saving}
              activeOpacity={0.7}
            >
              <Text style={styles.btnGhostText}>Não, obrigado</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnSolid, saving && styles.btnOff]}
              onPress={() => onAnswer(true)}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.btnSolidText}>Sim, quero receber</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
  },
  iconWrap: {
    width: 52, height: 52, borderRadius: 15,
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20, fontWeight: '900', color: colors.text,
    letterSpacing: -0.3, marginBottom: 8,
  },
  pergunta: {
    fontSize: 16, fontWeight: '700', color: colors.text,
    lineHeight: 22, marginTop: 6,
  },
  lista: { marginTop: 14, gap: 7 },
  item: { fontSize: 13.5, color: colors.textMuted, lineHeight: 19 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btn: {
    flex: 1, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  btnGhost: { borderWidth: 1, borderColor: colors.border },
  btnGhostText: { fontSize: 14.5, fontWeight: '700', color: colors.textMuted },
  btnSolid: { backgroundColor: colors.primary },
  btnSolidText: { fontSize: 14.5, fontWeight: '800', color: '#fff' },
  btnOff: { opacity: 0.6 },
})
