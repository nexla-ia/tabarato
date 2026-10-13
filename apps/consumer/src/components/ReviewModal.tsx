import { useState } from 'react'
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, TextInput,
  ScrollView, Image, ActivityIndicator, Animated, Platform, Pressable,
  KeyboardAvoidingView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { api } from '../api/client'
import { uploadImageAsset } from '../api/upload'

const PRIMARY = '#FF5500'
const PRIMARY_LIGHT = '#FFF0EB'
const TEXT = '#1A0A00'
const MUTED = '#9A8880'
const CARD = '#FFFFFF'
const BORDER = '#F0E8E2'
const BG = '#FFF8F3'

const STAR_LABELS = ['', 'Péssimo', 'Ruim', 'Regular', 'Bom', 'Excelente']
const STAR_COLORS = ['', '#EF4444', '#F97316', '#EAB308', '#22C55E', '#059669']

interface Props {
  visible: boolean
  orderId: string
  storeName: string
  onClose: () => void
  onSuccess: () => void
}

export function ReviewModal({ visible, orderId, storeName, onClose, onSuccess }: Props) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setRating(0)
    setComment('')
    setPhotos([])
    setError('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function pickPhoto() {
    if (photos.length >= 3) return
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) return

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    })
    if (result.canceled) return

    const asset = result.assets[0]
    setUploading(true)
    try {
      const url = await uploadImageAsset(asset.uri, { name: 'review.jpg' })
      setPhotos((p) => [...p, url])
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível enviar a foto.')
    } finally {
      setUploading(false)
    }
  }

  function removePhoto(url: string) {
    setPhotos((p) => p.filter((u) => u !== url))
  }

  async function handleSubmit() {
    if (rating === 0) { setError('Selecione uma nota de 1 a 5 estrelas.'); return }
    setError('')
    setSubmitting(true)
    try {
      await api.post('/reviews', {
        orderId,
        rating,
        comment: comment.trim() || undefined,
        photos,
      })
      reset()
      onSuccess()
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Não foi possível enviar a avaliação.')
    } finally {
      setSubmitting(false)
    }
  }

  const starColor = rating > 0 ? STAR_COLORS[rating] : MUTED

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="star" size={18} color={PRIMARY} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Avaliar pedido</Text>
              <Text style={styles.headerSub} numberOfLines={1}>{storeName}</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Ionicons name="close" size={18} color={MUTED} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Stars */}
            <Text style={styles.sectionLabel}>Sua nota</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <TouchableOpacity key={s} onPress={() => setRating(s)} activeOpacity={0.7}>
                  <Ionicons
                    name={s <= rating ? 'star' : 'star-outline'}
                    size={44}
                    color={s <= rating ? starColor : '#E5DDD8'}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {rating > 0 && (
              <Text style={[styles.starLabel, { color: starColor }]}>{STAR_LABELS[rating]}</Text>
            )}

            {/* Comment */}
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Comentário <Text style={styles.optional}>(opcional)</Text></Text>
            <TextInput
              style={styles.commentInput}
              value={comment}
              onChangeText={setComment}
              placeholder="O que você achou? Conta mais detalhes sobre o pedido..."
              placeholderTextColor={MUTED}
              multiline
              numberOfLines={4}
              maxLength={500}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{comment.length}/500</Text>

            {/* Photos */}
            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
              Fotos <Text style={styles.optional}>(até 3)</Text>
            </Text>
            <View style={styles.photosRow}>
              {photos.map((url) => (
                <View key={url} style={styles.photoThumb}>
                  <Image source={{ uri: url }} style={styles.photoImg} />
                  <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(url)}>
                    <Ionicons name="close-circle" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {photos.length < 3 && (
                <TouchableOpacity
                  style={styles.photoAdd}
                  onPress={pickPhoto}
                  disabled={uploading}
                  activeOpacity={0.8}
                >
                  {uploading
                    ? <ActivityIndicator color={PRIMARY} size="small" />
                    : <>
                        <Ionicons name="camera-outline" size={24} color={PRIMARY} />
                        <Text style={styles.photoAddText}>Adicionar</Text>
                      </>
                  }
                </TouchableOpacity>
              )}
            </View>

            {/* Error */}
            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={15} color="#DC2626" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnLoading]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.88}
            >
              {submitting
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={styles.submitBtnText}>Enviar avaliação</Text>
                  </>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26,10,0,0.5)' },
  sheet: {
    backgroundColor: CARD,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#DDD', alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  headerIcon: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: PRIMARY_LIGHT,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: TEXT },
  headerSub: { fontSize: 12, color: MUTED, marginTop: 1 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#F0E8E2',
    alignItems: 'center', justifyContent: 'center',
  },

  body: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  optional: { fontWeight: '500', textTransform: 'none', fontSize: 11 },

  starsRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 8 },
  starLabel: { textAlign: 'center', fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },

  commentInput: {
    backgroundColor: BG, borderRadius: 14,
    borderWidth: 1.5, borderColor: BORDER,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12,
    fontSize: 14, color: TEXT, fontWeight: '500',
    minHeight: 100,
  },
  charCount: { fontSize: 11, color: MUTED, textAlign: 'right', marginTop: 4 },

  photosRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  photoThumb: { position: 'relative', width: 86, height: 86, borderRadius: 12, overflow: 'hidden' },
  photoImg: { width: '100%', height: '100%' },
  photoRemove: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10,
  },
  photoAdd: {
    width: 86, height: 86, borderRadius: 12,
    borderWidth: 1.5, borderColor: BORDER, borderStyle: 'dashed',
    backgroundColor: PRIMARY_LIGHT,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  photoAddText: { fontSize: 11, fontWeight: '700', color: PRIMARY },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEE2E2', borderRadius: 10, padding: 10, marginTop: 12,
  },
  errorText: { flex: 1, fontSize: 13, color: '#DC2626', fontWeight: '500' },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 15, marginTop: 20,
    shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  submitBtnLoading: { opacity: 0.75 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
})
