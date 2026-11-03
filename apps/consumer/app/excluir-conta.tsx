import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../src/api/client'
import { colors } from '../src/theme/colors'
import { useAuthStore } from '../src/stores/auth.store'
import { useToast } from '../src/components/Toast'
import { LoadError } from '../src/components/LoadError'
import { Relevo } from '../src/components/Relevo'
import { relevo } from '../src/theme/relevo'

const TEXT = '#1A0A00'
const MUTED = '#7A5C4A'
const BORDER = '#F0E8E0'
const RED = '#B91C1C'

/**
 * Exclusão de conta — exigida pela App Store e pelo Google Play. Mostra primeiro o
 * que impede (pedido em andamento, saldo para sacar), depois o que acontece, e só
 * libera o botão com a palavra EXCLUIR digitada.
 */
export default function ExcluirContaScreen() {
  const insets = useSafeAreaInsets()
  const { show: toast } = useToast()
  const { user, clearAuth } = useAuthStore()
  const [check, setCheck] = useState<{ canDelete: boolean; motivos: string[] } | null>(null)
  const [erro, setErro] = useState(false)
  const [confirmacao, setConfirmacao] = useState('')
  const [excluindo, setExcluindo] = useState(false)

  function carregar() {
    setErro(false)
    api.get('/users/me/deletion-check').then((r) => setCheck(r.data)).catch(() => setErro(true))
  }
  useEffect(() => { carregar() }, [])

  const loja = user?.role === 'STORE_OWNER'
  const entregador = user?.role === 'COURIER'
  const pronto = confirmacao.trim().toUpperCase() === 'EXCLUIR'

  async function excluir() {
    if (!pronto || excluindo) return
    setExcluindo(true)
    try {
      await api.delete('/users/me', { data: { confirm: 'EXCLUIR' } })
      await clearAuth()
      toast('Sua conta foi excluída.', 'success')
      router.replace('/(tabs)')
    } catch (e: any) {
      toast(e?.response?.data?.message ?? 'Não foi possível excluir agora.', 'error')
      carregar()
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <KeyboardAvoidingView style={[s.root, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.voltar}>
          <Ionicons name="arrow-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <Text style={s.titulo}>Excluir conta</Text>
        <View style={{ width: 38 }} />
      </View>

      {erro ? (
        <LoadError onRetry={carregar} sub="Não conseguimos verificar sua conta. Verifique a conexão." />
      ) : !check ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} size="large" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 14 }} keyboardShouldPersistTaps="handled">
          {!check.canDelete ? (
            <View style={s.bloqueio}>
              <View style={s.bloqueioTopo}>
                <Ionicons name="alert-circle" size={20} color="#B45309" />
                <Text style={s.bloqueioTitulo}>Antes de excluir, resolva isto</Text>
              </View>
              {check.motivos.map((m) => (
                <Text key={m} style={s.bloqueioItem}>• {m}</Text>
              ))}
            </View>
          ) : null}

          <View style={s.cartao}>
            <Text style={s.cartaoTitulo}>O que acontece</Text>
            <Item icone="person-remove-outline" texto="Seu nome, e-mail, telefone, CPF, endereços e favoritos são apagados, e você sai do app em todos os aparelhos." />
            <Item icone="receipt-outline" texto="Pedidos e pagamentos antigos ficam registrados sem seus dados pessoais, porque a lei exige guardar o histórico fiscal." />
            {loja && <Item icone="storefront-outline" texto="Sua loja sai do ar na hora. Os dados da empresa (CNPJ) ficam guardados pelo prazo legal." />}
            {entregador && <Item icone="bicycle-outline" texto="Você deixa de receber corridas. CPF e CNH ficam guardados pelo prazo legal das entregas feitas." />}
            <Item icone="close-circle-outline" texto="Não dá para desfazer. Para voltar a usar o Tá Barato, será preciso criar uma conta nova." />
          </View>

          {check.canDelete && (
            <View style={s.cartao}>
              <Text style={s.cartaoTitulo}>Para confirmar, digite EXCLUIR</Text>
              <TextInput
                style={s.input}
                value={confirmacao}
                onChangeText={setConfirmacao}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="EXCLUIR"
                placeholderTextColor="#D6C6BA"
              />
              <Relevo
                style={[s.botao, (!pronto || excluindo) && { opacity: 0.45 }]}
                onPress={excluir}
                disabled={!pronto || excluindo}
              >
                {excluindo ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoTxt}>Excluir minha conta</Text>}
              </Relevo>
            </View>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  )
}

function Item({ icone, texto }: { icone: any; texto: string }) {
  return (
    <View style={s.item}>
      <Ionicons name={icone} size={18} color={MUTED} style={{ marginTop: 1 }} />
      <Text style={s.itemTxt}>{texto}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF8F3' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  voltar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontSize: 17, fontWeight: '900', color: TEXT },

  bloqueio: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 16, padding: 14, gap: 6 },
  bloqueioTopo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  bloqueioTitulo: { fontSize: 14.5, fontWeight: '800', color: '#92400E' },
  bloqueioItem: { fontSize: 13.5, color: '#92400E', lineHeight: 19 },

  cartao: { ...relevo.card, borderRadius: 16, padding: 16, gap: 12 },
  cartaoTitulo: { fontSize: 14, fontWeight: '800', color: TEXT },
  item: { flexDirection: 'row', gap: 10 },
  itemTxt: { flex: 1, fontSize: 13.5, color: TEXT, lineHeight: 19 },

  input: {
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, fontWeight: '800', letterSpacing: 2, color: RED,
  },
  botao: { ...relevo.botao, backgroundColor: RED, borderBottomColor: '#7F1D1D', shadowColor: '#7F1D1D', borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  botaoTxt: { color: '#fff', fontSize: 15, fontWeight: '900' },
})
