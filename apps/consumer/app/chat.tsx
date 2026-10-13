import { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '../src/stores/auth.store'
import { getDeliverySocket } from '../src/socket'
import { colors } from '../src/theme/colors'

const PRIMARY = colors.primary
const BG = '#FFF8F3'
const CARD = '#FFFFFF'
const TEXT = '#1A0A00'
const MUTED = '#9A8880'
const BORDER = '#F0E8E0'

interface Message {
  id: string
  orderId: string
  senderId: string
  senderRole: string
  content: string
  createdAt: string
  sender: { id: string; name: string; role: string }
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets()
  // `peer` = com quem se está falando (ex.: "o cliente" no lado do lojista). Opcional.
  const { orderId, peer } = useLocalSearchParams<{ orderId: string; peer?: string }>()
  const user = useAuthStore(s => s.user)
  const accessToken = useAuthStore(s => s.accessToken)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [closed, setClosed] = useState(false)
  const listRef = useRef<FlatList>(null)

  useEffect(() => {
    if (!orderId) return
    const socket = getDeliverySocket(accessToken ?? undefined)

    // Join order room + request history
    socket.emit('order:watch', { orderId })
    socket.emit('chat:history', { orderId })

    // Handlers nomeados: removidos individualmente no cleanup (não derrubam
    // outros listeners dos mesmos eventos no socket singleton compartilhado).
    const onHistory = (msgs: Message[]) => {
      setMessages(msgs)
      setLoading(false)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100)
    }
    const onMessage = (msg: Message) => {
      setMessages(prev => [...prev, msg])
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    }
    // Pedido finalizado (entregue/cancelado): o back recusa novas mensagens e
    // emite chat:closed — trava o campo pra não parecer que enviou.
    const onClosed = () => setClosed(true)
    socket.on('chat:history', onHistory)
    socket.on('chat:message', onMessage)
    socket.on('chat:closed', onClosed)

    return () => {
      // Sai da sala do pedido e remove só os próprios handlers.
      socket.emit('order:unwatch', { orderId })
      socket.off('chat:history', onHistory)
      socket.off('chat:message', onMessage)
      socket.off('chat:closed', onClosed)
    }
  }, [orderId, accessToken])

  function sendMessage() {
    const content = input.trim()
    if (!content || !orderId) return
    const socket = getDeliverySocket(accessToken ?? undefined)
    socket.emit('chat:send', { orderId, content })
    setInput('')
  }

  const renderItem = ({ item }: { item: Message }) => {
    const isMe = item.senderId === user?.id
    return (
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        {!isMe && (
          <Text style={styles.bubbleSender}>{item.sender.name}</Text>
        )}
        <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.content}</Text>
        <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
          {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BG }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.bottom}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={TEXT} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Chat do pedido</Text>
          <Text style={styles.headerSub}>#{String(orderId).slice(-6).toUpperCase()}</Text>
        </View>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={PRIMARY} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={MUTED} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>Nenhuma mensagem ainda</Text>
              <Text style={styles.emptySub}>Mande uma mensagem para {peer ?? 'a loja ou entregador'}</Text>
            </View>
          }
          renderItem={renderItem}
        />
      )}

      {/* Input (ou aviso de conversa encerrada) */}
      {closed ? (
        <View style={[styles.closedRow, { paddingBottom: insets.bottom + 12 }]}>
          <Ionicons name="lock-closed-outline" size={15} color={MUTED} />
          <Text style={styles.closedText}>Pedido finalizado — a conversa está encerrada.</Text>
        </View>
      ) : (
        <View style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Escreva uma mensagem..."
            placeholderTextColor={MUTED}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !input.trim() && { opacity: 0.5 }]}
            onPress={sendMessage}
            disabled={!input.trim()}
            activeOpacity={0.8}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14,
    backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#F5F0EC', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: TEXT, textAlign: 'center' },
  headerSub: { fontSize: 12, color: MUTED, textAlign: 'center' },

  list: { padding: 16, gap: 8, flexGrow: 1 },

  bubble: {
    maxWidth: '80%', borderRadius: 16, padding: 10, paddingBottom: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 1,
  },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: PRIMARY, borderBottomRightRadius: 4 },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: CARD, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: BORDER },
  bubbleSender: { fontSize: 11, fontWeight: '700', color: MUTED, marginBottom: 3 },
  bubbleText: { fontSize: 14, color: TEXT, lineHeight: 19 },
  bubbleTextMe: { color: '#fff' },
  bubbleTime: { fontSize: 10, color: MUTED, marginTop: 4, alignSelf: 'flex-end' },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.7)' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: TEXT, marginBottom: 6 },
  emptySub: { fontSize: 13, color: MUTED, textAlign: 'center' },

  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 10,
    backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER,
  },
  input: {
    flex: 1, backgroundColor: '#F5F0EC', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: TEXT,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center',
  },
  closedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 14,
    backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER,
  },
  closedText: { fontSize: 13, color: MUTED, fontWeight: '600' },
})
