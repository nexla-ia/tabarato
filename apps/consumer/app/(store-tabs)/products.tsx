import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, TextInput,
  Modal, KeyboardAvoidingView, Platform, ActivityIndicator, RefreshControl, Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { api } from '../../src/api/client'
import { uploadImageAsset } from '../../src/api/upload'
import { colors } from '../../src/theme/colors'
import { useToast } from '../../src/components/Toast'

interface Category {
  id: string
  name: string
  icon?: string
}

interface ProductVariation {
  id: string
  name: string
  size?: string | null
  color?: string | null
  price: number
  stock?: number | null
  isActive: boolean
  sku?: string | null
}

interface Product {
  id: string
  name: string
  category: Category
  basePrice: number | null
  comparePrice?: number | null
  stock: number | null
  isActive: boolean
  blockedByAdmin?: boolean
  blockReason?: string | null
  hasVariations: boolean
  imageUrl?: string | null
  promoBuyQty?: number | null
  promoPayQty?: number | null
}

interface ProductFormState {
  name: string
  categoryId: string
  basePrice: string
  comparePrice: string
  stock: string
  imageUrl: string
  maxDeliveryKm: string
  promoBuyQty: string
  promoPayQty: string
}

interface VariationFormState {
  id?: string
  name: string
  size: string
  color: string
  price: string
  stock: string
}

const EMPTY_FORM: ProductFormState = { name: '', categoryId: '', basePrice: '', comparePrice: '', stock: '', imageUrl: '', maxDeliveryKm: '', promoBuyQty: '', promoPayQty: '' }
const EMPTY_VAR_FORM: VariationFormState = { name: '', size: '', color: '', price: '', stock: '' }

function ProductCard({
  product, onToggle, onEdit, onDelete, onVariations, onDuplicate,
}: {
  product: Product
  onToggle: (id: string) => void
  onEdit: (product: Product) => void
  onDelete: (id: string) => void
  onVariations: (product: Product) => void
  onDuplicate: (id: string) => void
}) {
  return (
    <View style={[card.container, (!product.isActive || product.blockedByAdmin) && card.inactive]}>
      {product.imageUrl ? (
        <Image source={{ uri: product.imageUrl }} style={card.image} resizeMode="cover" />
      ) : (
        <View style={card.imagePlaceholder}>
          <Ionicons name="cube-outline" size={28} color={product.isActive ? colors.primary : '#C0B0A8'} />
        </View>
      )}
      <View style={card.body}>
        <View style={card.topRow}>
          <View style={card.categoryBadge}>
            <Text style={card.categoryText}>{product.category?.name ?? 'Sem categoria'}</Text>
          </View>
          {product.hasVariations && (
            <View style={card.variationsBadge}>
              <Text style={card.variationsText}>
                {(product as any).variationCount > 0
                  ? `Variações (${(product as any).variationCount})`
                  : 'Variações'}
              </Text>
            </View>
          )}
        </View>

        <Text style={[card.name, !product.isActive && card.nameInactive]} numberOfLines={2}>
          {product.name}
        </Text>

        {/* Bloqueio da administração — o lojista precisa saber por que o item sumiu do app */}
        {product.blockedByAdmin && (
          <View style={card.blockedBox}>
            <Ionicons name="ban-outline" size={13} color="#B91C1C" />
            <Text style={card.blockedText}>
              Bloqueado pela administração — não aparece no app.
              {product.blockReason ? ` Motivo: ${product.blockReason}` : ''}
            </Text>
          </View>
        )}

        <View style={card.bottomRow}>
          <View>
            {product.basePrice != null && product.basePrice > 0 ? (
              <Text style={card.price}>R$ {Number(product.basePrice).toFixed(2)}</Text>
            ) : (
              <Text style={[card.price, { color: '#9A8880', fontSize: 13 }]}>Ver variações</Text>
            )}
            {product.stock != null && (
              <View style={card.stockRow}>
                <Ionicons
                  name={product.stock > 5 ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                  size={11}
                  color={product.stock > 5 ? '#16A34A' : '#D97706'}
                />
                <Text style={[card.stockText, { color: product.stock > 5 ? '#16A34A' : '#D97706' }]}>
                  {product.stock} em estoque
                </Text>
              </View>
            )}
          </View>
          <Switch
            value={product.isActive}
            onValueChange={() => onToggle(product.id)}
            trackColor={{ false: '#E0D8D0', true: colors.primary }}
            thumbColor="#fff"
            style={{ transform: [{ scale: 0.85 }] }}
          />
        </View>

        <View style={card.actions}>
          <TouchableOpacity style={card.editBtn} onPress={() => onEdit(product)} activeOpacity={0.8}>
            <Ionicons name="pencil-outline" size={14} color={colors.primary} />
            <Text style={card.editBtnText}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={card.variationsBtn} onPress={() => onVariations(product)} activeOpacity={0.8}>
            <Ionicons name="options-outline" size={14} color="#7C3AED" />
            <Text style={card.variationsBtnText}>Variações</Text>
          </TouchableOpacity>
          <TouchableOpacity style={card.duplicateBtn} onPress={() => onDuplicate(product.id)} activeOpacity={0.8}>
            <Ionicons name="copy-outline" size={14} color="#059669" />
          </TouchableOpacity>
          <TouchableOpacity style={card.deleteBtn} onPress={() => onDelete(product.id)} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={14} color="#DC2626" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

// Normaliza pra busca ignorando acentos e maiúsculas ("acai" acha "Açaí").
function stripAccents(s: string) {
  return s
    .toLowerCase()
    .replace(/[áàâãä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôõö]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/ç/g, 'c')
}

function ProductModal({
  visible, onClose, onSave, categories, categoriesLoading, initial, saving,
}: {
  visible: boolean
  onClose: () => void
  onSave: (form: ProductFormState) => void
  categories: Category[]
  categoriesLoading: boolean
  initial?: ProductFormState
  saving: boolean
}) {
  const { show: toast } = useToast()
  const [form, setForm] = useState<ProductFormState>(initial ?? EMPTY_FORM)
  const [uploading, setUploading] = useState(false)
  const [catSearch, setCatSearch] = useState('')
  // Fundo branco automatico (Bria). `fotoOriginal` guarda a foto de antes para o
  // lojista poder desfazer — a IA acerta quase sempre, mas nao sempre.
  const [fundoBrancoAtivo, setFundoBrancoAtivo] = useState(false)
  const [processandoFundo, setProcessandoFundo] = useState(false)
  const [fotoOriginal, setFotoOriginal] = useState<string | null>(null)

  // Pergunta ao servidor se o recurso esta ligado (sem a chave da Bria, o botao
  // nao aparece). Falha aqui so esconde o botao — nunca atrapalha o cadastro.
  useEffect(() => {
    if (!visible) return
    api.get('/uploads/white-background/status')
      .then((r) => setFundoBrancoAtivo(!!r.data?.enabled))
      .catch(() => setFundoBrancoAtivo(false))
  }, [visible])

  const catQuery = stripAccents(catSearch.trim())
  const filteredCats = catQuery
    ? categories.filter((c) => stripAccents(c.name).includes(catQuery))
    : categories

  useEffect(() => {
    setForm(initial ?? EMPTY_FORM)
    setFotoOriginal(null)
  }, [initial, visible])

  const isEdit = !!initial?.name

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      toast('Permita acesso à galeria nas configurações.', 'error')
      return
    }
    // SEM allowsEditing: o corte do expo-image-picker trava no Android real.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    })
    if (result.canceled) return

    const asset = result.assets?.[0]
    if (!asset?.uri) { toast('Não consegui ler a imagem selecionada. Tente escolher outra.', 'error'); return }
    setUploading(true)
    try {
      const url = await uploadImageAsset(asset.uri, { name: 'product.jpg' })
      setForm((f) => ({ ...f, imageUrl: url }))
      setFotoOriginal(null)
    } catch (e: any) {
      toast(e?.message ?? 'Não foi possível fazer upload da imagem.', 'error')
    } finally {
      setUploading(false)
    }
  }

  async function aplicarFundoBranco() {
    if (!form.imageUrl || processandoFundo) return
    setProcessandoFundo(true)
    try {
      const { data } = await api.post('/uploads/image/white-background', { imageUrl: form.imageUrl })
      setFotoOriginal(form.imageUrl)
      setForm((f) => ({ ...f, imageUrl: data.url }))
    } catch (e: any) {
      // A foto original continua no formulario: falhar aqui nao perde nada.
      toast(e?.response?.data?.message ?? 'Nao foi possivel deixar o fundo branco agora.', 'error')
    } finally {
      setProcessandoFundo(false)
    }
  }

  function desfazerFundoBranco() {
    if (!fotoOriginal) return
    setForm((f) => ({ ...f, imageUrl: fotoOriginal }))
    setFotoOriginal(null)
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={modal.container}>
          <View style={modal.header}>
            <Text style={modal.title}>{isEdit ? 'Editar produto' : 'Novo produto'}</Text>
            <TouchableOpacity style={modal.closeBtn} onPress={onClose} activeOpacity={0.8}>
              <Ionicons name="close" size={20} color="#1A0A00" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={modal.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            <TouchableOpacity style={modal.imagePicker} onPress={pickImage} activeOpacity={0.8} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator color={colors.primary} />
              ) : form.imageUrl ? (
                <>
                  <Image source={{ uri: form.imageUrl }} style={modal.imagePreview} />
                  <View style={modal.imageEditBadge}>
                    <Ionicons name="camera" size={14} color="#fff" />
                  </View>
                </>
              ) : (
                <View style={modal.imagePlaceholder}>
                  <Ionicons name="camera-outline" size={28} color={colors.primary} />
                  <Text style={modal.imagePlaceholderText}>Adicionar foto</Text>
                </View>
              )}
            </TouchableOpacity>

            {fundoBrancoAtivo && !!form.imageUrl && !uploading && (
              fotoOriginal ? (
                <View style={modal.fundoLinha}>
                  <Ionicons name="checkmark-circle" size={16} color="#15803D" />
                  <Text style={modal.fundoOk}>Fundo branco aplicado</Text>
                  <TouchableOpacity onPress={desfazerFundoBranco} hitSlop={8} activeOpacity={0.7}>
                    <Text style={modal.fundoDesfazer}>Desfazer</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[modal.fundoBtn, processandoFundo && { opacity: 0.6 }]}
                  onPress={aplicarFundoBranco}
                  disabled={processandoFundo}
                  activeOpacity={0.85}
                >
                  {processandoFundo
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <Ionicons name="sparkles" size={15} color={colors.primary} />}
                  <Text style={modal.fundoBtnTexto}>
                    {processandoFundo ? 'Deixando o fundo branco...' : 'Deixar fundo branco'}
                  </Text>
                </TouchableOpacity>
              )
            )}

            <View style={modal.fieldWrap}>
              <Text style={modal.fieldLabel}>NOME DO PRODUTO *</Text>
              <TextInput
                style={modal.input}
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                placeholder="Ex: X-Burguer Clássico"
                placeholderTextColor="#C0B0A8"
              />
            </View>

            <View style={modal.fieldWrap}>
              <Text style={modal.fieldLabel}>CATEGORIA *</Text>
              {categoriesLoading ? (
                <View style={modal.catLoading}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ color: '#9A8880', fontSize: 13, marginLeft: 8 }}>Carregando...</Text>
                </View>
              ) : categories.length === 0 ? (
                <Text style={{ color: '#9A8880', fontSize: 13, paddingVertical: 8 }}>Nenhuma categoria disponível.</Text>
              ) : (
                <>
                  <View style={modal.catSearchRow}>
                    <Ionicons name="search-outline" size={16} color="#C0B0A8" />
                    <TextInput
                      style={modal.catSearchInput}
                      value={catSearch}
                      onChangeText={setCatSearch}
                      placeholder="Buscar categoria..."
                      placeholderTextColor="#C0B0A8"
                      autoCorrect={false}
                    />
                    {catSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setCatSearch('')} hitSlop={8}>
                        <Ionicons name="close-circle" size={16} color="#C0B0A8" />
                      </TouchableOpacity>
                    )}
                  </View>
                  {filteredCats.length === 0 ? (
                    <Text style={{ color: '#9A8880', fontSize: 13, paddingVertical: 8 }}>
                      Nenhuma categoria encontrada para “{catSearch.trim()}”.
                    </Text>
                  ) : (
                    <View style={modal.catWrap}>
                      {filteredCats.map((cat) => {
                        const active = form.categoryId === cat.id
                        return (
                          <TouchableOpacity
                            key={cat.id}
                            style={[modal.catBtn, active && modal.catBtnActive]}
                            onPress={() => setForm((f) => ({ ...f, categoryId: cat.id }))}
                            activeOpacity={0.8}
                          >
                            <Text style={[modal.catBtnText, active && modal.catBtnTextActive]}>{cat.name}</Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  )}
                </>
              )}
            </View>

            <View style={modal.fieldWrap}>
              <Text style={modal.fieldLabel}>PREÇO BASE (R$)</Text>
              <TextInput
                style={modal.input}
                value={form.basePrice}
                onChangeText={(v) => setForm((f) => ({ ...f, basePrice: v }))}
                placeholder="0,00 (deixe vazio se tiver variações)"
                placeholderTextColor="#C0B0A8"
                keyboardType="numeric"
              />
            </View>

            <View style={modal.fieldWrap}>
              <Text style={modal.fieldLabel}>OFERTA — PREÇO ANTIGO (R$)</Text>
              <TextInput
                style={modal.input}
                value={form.comparePrice}
                onChangeText={(v) => setForm((f) => ({ ...f, comparePrice: v }))}
                placeholder="Vazio = sem oferta"
                placeholderTextColor="#C0B0A8"
                keyboardType="numeric"
              />
              {/* Avisa enquanto digita. O servidor recusa desconto inexistente,
                  e descobrir isso só no erro ao salvar é pior. */}
              {(() => {
                const de = parseFloat((form.comparePrice || '').replace(',', '.'))
                const por = parseFloat((form.basePrice || '').replace(',', '.'))
                if (!de) return null
                if (!por || de <= por) {
                  return (
                    <Text style={[modal.fieldHint, { color: colors.danger }]}>
                      Precisa ser maior que o preço base — senão não há desconto.
                    </Text>
                  )
                }
                return (
                  <Text style={[modal.fieldHint, { color: '#15803D' }]}>
                    {Math.round(((de - por) / de) * 100)}% de desconto. Aparece em “Ofertas Imperdíveis”.
                  </Text>
                )
              })()}
            </View>

            <View style={modal.fieldWrap}>
              <Text style={modal.fieldLabel}>ESTOQUE (unidades)</Text>
              <TextInput
                style={modal.input}
                value={form.stock}
                onChangeText={(v) => setForm((f) => ({ ...f, stock: v }))}
                placeholder="Deixe vazio para ilimitado"
                placeholderTextColor="#C0B0A8"
                keyboardType="numeric"
              />
            </View>

            <View style={modal.fieldWrap}>
              <Text style={modal.fieldLabel}>DISTÂNCIA MÁXIMA DE ENTREGA (km)</Text>
              <TextInput
                style={modal.input}
                value={form.maxDeliveryKm}
                onChangeText={(v) => setForm((f) => ({ ...f, maxDeliveryKm: v }))}
                placeholder="Ex: 5 — deixe vazio sem limite"
                placeholderTextColor="#C0B0A8"
                keyboardType="numeric"
              />
            </View>

            {/* Desconto progressivo — Leve X Pague Y */}
            <View style={modal.fieldWrap}>
              <Text style={modal.fieldLabel}>PROMOÇÃO — LEVE X PAGUE Y (opcional)</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={modal.promoMini}>Leve</Text>
                  <TextInput
                    style={modal.input}
                    value={form.promoBuyQty}
                    onChangeText={(v) => setForm((f) => ({ ...f, promoBuyQty: v.replace(/[^0-9]/g, '') }))}
                    placeholder="Ex: 3"
                    placeholderTextColor="#C0B0A8"
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={modal.promoMini}>Pague</Text>
                  <TextInput
                    style={modal.input}
                    value={form.promoPayQty}
                    onChangeText={(v) => setForm((f) => ({ ...f, promoPayQty: v.replace(/[^0-9]/g, '') }))}
                    placeholder="Ex: 2"
                    placeholderTextColor="#C0B0A8"
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>
              </View>
              {!!form.promoBuyQty && !!form.promoPayQty && Number(form.promoBuyQty) > Number(form.promoPayQty) && (
                <View style={modal.promoPreview}>
                  <Ionicons name="pricetag" size={13} color="#16A34A" />
                  <Text style={modal.promoPreviewText}>
                    Cliente leva {form.promoBuyQty} e paga {form.promoPayQty} — {Number(form.promoBuyQty) - Number(form.promoPayQty)} grátis a cada {form.promoBuyQty}.
                  </Text>
                </View>
              )}
            </View>

            <View style={modal.infoBox}>
              <Ionicons name="information-circle-outline" size={15} color="#7C3AED" />
              <Text style={[modal.infoText, { color: '#7C3AED' }]}>
                Variações (tamanhos, sabores) podem ser adicionadas após criar o produto.
              </Text>
            </View>

            <TouchableOpacity
              style={[modal.saveBtn, saving && { opacity: 0.7 }]}
              onPress={() => onSave(form)}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Ionicons name="checkmark-outline" size={18} color="#fff" />
                    <Text style={modal.saveBtnText}>{isEdit ? 'Salvar alterações' : 'Criar produto'}</Text>
                  </>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function VariationsModal({
  productId, productName, visible, onClose, onCountChange,
}: {
  productId: string
  productName: string
  visible: boolean
  onClose: () => void
  onCountChange: (productId: string, count: number) => void
}) {
  const { show: toast } = useToast()
  const [variations, setVariations] = useState<ProductVariation[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [form, setForm] = useState<VariationFormState | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible && productId) {
      loadVariations()
    } else {
      setForm(null)
      setLoadError(false)
    }
  }, [visible, productId])

  async function loadVariations() {
    setLoading(true)
    setLoadError(false)
    try {
      const { data } = await api.get(`/products/${productId}/variations`)
      setVariations(data)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  function startAdd() {
    setForm({ ...EMPTY_VAR_FORM })
  }

  function startEdit(v: ProductVariation) {
    setForm({
      id: v.id,
      name: v.name,
      size: v.size ?? '',
      color: v.color ?? '',
      price: String(v.price),
      stock: v.stock != null ? String(v.stock) : '',
    })
  }

  async function handleSaveVariation() {
    if (!form) return
    if (!form.name.trim()) {
      toast('Informe o nome da variação.', 'error')
      return
    }
    const priceNum = parseFloat(form.price.replace(',', '.'))
    if (isNaN(priceNum) || priceNum < 0) {
      toast('Informe um preço válido.', 'error')
      return
    }

    const payload: Record<string, any> = { name: form.name.trim(), price: priceNum }
    if (form.size.trim()) payload.size = form.size.trim()
    if (form.color.trim()) payload.color = form.color.trim()
    if (form.stock) payload.stock = parseInt(form.stock, 10)

    setSaving(true)
    try {
      if (form.id) {
        const { data } = await api.patch(`/products/variations/${form.id}`, payload)
        const updated = variations.map((v) => (v.id === form.id ? { ...v, ...data } : v))
        setVariations(updated)
        onCountChange(productId, updated.length)
      } else {
        const { data } = await api.post(`/products/${productId}/variations`, payload)
        const updated = [...variations, data]
        setVariations(updated)
        onCountChange(productId, updated.length)
      }
      setForm(null)
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Não foi possível salvar a variação.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(v: ProductVariation) {
    try {
      const { data } = await api.patch(`/products/variations/${v.id}/toggle`)
      setVariations((prev) => prev.map((vv) => (vv.id === v.id ? { ...vv, isActive: data.isActive } : vv)))
    } catch {
      toast('Não foi possível alterar o status da variação.', 'error')
    }
  }

  async function handleDelete(variationId: string) {
    Alert.alert('Excluir variação', 'A variação será removida permanentemente.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/products/variations/${variationId}`)
            const updated = variations.filter((v) => v.id !== variationId)
            setVariations(updated)
            onCountChange(productId, updated.length)
          } catch {
            Alert.alert('Erro', 'Não foi possível excluir a variação.')
          }
        },
      },
    ])
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={varModal.container}>
          <View style={varModal.header}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={varModal.headerTitle}>Variações</Text>
              <Text style={varModal.headerSub} numberOfLines={1}>{productName}</Text>
            </View>
            <TouchableOpacity style={varModal.addBtn} onPress={startAdd} activeOpacity={0.85}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={varModal.addBtnText}>Adicionar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={varModal.closeBtn} onPress={onClose} activeOpacity={0.8}>
              <Ionicons name="close" size={20} color="#1A0A00" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={varModal.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : loadError ? (
            <View style={varModal.center}>
              <Ionicons name="alert-circle-outline" size={40} color="#DC2626" style={{ marginBottom: 12 }} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#1A0A00', marginBottom: 6 }}>
                Erro ao carregar variações
              </Text>
              <TouchableOpacity
                onPress={loadVariations}
                style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>Tentar novamente</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={varModal.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {variations.length === 0 && !form && (
                <View style={varModal.empty}>
                  <View style={varModal.emptyIcon}>
                    <Ionicons name="options-outline" size={36} color="#7C3AED" />
                  </View>
                  <Text style={varModal.emptyTitle}>Nenhuma variação</Text>
                  <Text style={varModal.emptyText}>
                    Adicione tamanhos, sabores ou outras variações do produto.
                  </Text>
                  <TouchableOpacity style={varModal.emptyBtn} onPress={startAdd} activeOpacity={0.85}>
                    <Ionicons name="add" size={16} color="#fff" />
                    <Text style={varModal.emptyBtnText}>Adicionar variação</Text>
                  </TouchableOpacity>
                </View>
              )}

              {variations.length > 0 && (
                <View style={varModal.list}>
                  {variations.map((v, idx) => (
                    <View
                      key={v.id}
                      style={[
                        varModal.varRow,
                        idx > 0 && varModal.varRowBorder,
                        !v.isActive && varModal.varRowInactive,
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={varModal.varNameRow}>
                          <Text style={[varModal.varName, !v.isActive && varModal.varNameInactive]}>
                            {v.name}
                          </Text>
                          {v.size && (
                            <View style={varModal.sizeChip}>
                              <Text style={varModal.sizeChipText}>{v.size}</Text>
                            </View>
                          )}
                          {v.color && (
                            <View style={varModal.colorChip}>
                              <Text style={varModal.colorChipText}>{v.color}</Text>
                            </View>
                          )}
                        </View>
                        <View style={varModal.varInfoRow}>
                          <Text style={varModal.varPrice}>R$ {Number(v.price).toFixed(2)}</Text>
                          {v.stock != null && (
                            <Text style={varModal.varStock}>{v.stock} un.</Text>
                          )}
                          {!v.isActive && (
                            <View style={varModal.inactivePill}>
                              <Text style={varModal.inactivePillText}>Inativo</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <Switch
                        value={v.isActive}
                        onValueChange={() => handleToggle(v)}
                        trackColor={{ false: '#E0D8D0', true: colors.primary }}
                        thumbColor="#fff"
                        style={{ transform: [{ scale: 0.78 }], marginLeft: 8 }}
                      />
                      <TouchableOpacity
                        style={varModal.actionBtn}
                        onPress={() => startEdit(v)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="pencil-outline" size={15} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[varModal.actionBtn, { backgroundColor: '#FEE2E2' }]}
                        onPress={() => handleDelete(v.id)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="trash-outline" size={15} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {form && (
                <View style={varModal.formCard}>
                  <Text style={varModal.formTitle}>
                    {form.id ? 'Editar variação' : 'Nova variação'}
                  </Text>

                  <View style={modal.fieldWrap}>
                    <Text style={modal.fieldLabel}>NOME *</Text>
                    <TextInput
                      style={modal.input}
                      value={form.name}
                      onChangeText={(v) => setForm((f) => (f ? { ...f, name: v } : f))}
                      placeholder="Ex: Grande, Chocolate, 500ml"
                      placeholderTextColor="#C0B0A8"
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={[modal.fieldWrap, { flex: 1 }]}>
                      <Text style={modal.fieldLabel}>TAMANHO</Text>
                      <TextInput
                        style={modal.input}
                        value={form.size}
                        onChangeText={(v) => setForm((f) => (f ? { ...f, size: v } : f))}
                        placeholder="P, M, G, GG"
                        placeholderTextColor="#C0B0A8"
                      />
                    </View>
                    <View style={[modal.fieldWrap, { flex: 1 }]}>
                      <Text style={modal.fieldLabel}>COR</Text>
                      <TextInput
                        style={modal.input}
                        value={form.color}
                        onChangeText={(v) => setForm((f) => (f ? { ...f, color: v } : f))}
                        placeholder="Vermelho, Azul"
                        placeholderTextColor="#C0B0A8"
                      />
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={[modal.fieldWrap, { flex: 1 }]}>
                      <Text style={modal.fieldLabel}>PREÇO (R$) *</Text>
                      <TextInput
                        style={modal.input}
                        value={form.price}
                        onChangeText={(v) => setForm((f) => (f ? { ...f, price: v } : f))}
                        placeholder="0,00"
                        placeholderTextColor="#C0B0A8"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={[modal.fieldWrap, { flex: 1 }]}>
                      <Text style={modal.fieldLabel}>ESTOQUE</Text>
                      <TextInput
                        style={modal.input}
                        value={form.stock}
                        onChangeText={(v) => setForm((f) => (f ? { ...f, stock: v } : f))}
                        placeholder="Ilimitado"
                        placeholderTextColor="#C0B0A8"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <TouchableOpacity
                      style={varModal.cancelBtn}
                      onPress={() => setForm(null)}
                      activeOpacity={0.8}
                    >
                      <Text style={varModal.cancelBtnText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[modal.saveBtn, { flex: 2 }, saving && { opacity: 0.7 }]}
                      onPress={handleSaveVariation}
                      disabled={saving}
                      activeOpacity={0.85}
                    >
                      {saving
                        ? <ActivityIndicator color="#fff" />
                        : <>
                            <Ionicons name="checkmark-outline" size={18} color="#fff" />
                            <Text style={modal.saveBtnText}>Salvar</Text>
                          </>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export default function StoreProductsScreen() {
  const { show: toast } = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [saving, setSaving] = useState(false)
  const [variationsProduct, setVariationsProduct] = useState<Product | null>(null)
  // Bulk select
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkModalVisible, setBulkModalVisible] = useState(false)
  const [bulkPrice, setBulkPrice] = useState('')
  const [bulkStock, setBulkStock] = useState('')
  const [bulkActive, setBulkActive] = useState<'yes' | 'no' | 'unchanged'>('unchanged')
  const [bulkSaving, setBulkSaving] = useState(false)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [storeRes, productsRes] = await Promise.all([
        api.get('/stores/my'),
        api.get('/products/my'),
      ])
      setStoreId(storeRes.data.id)
      setProducts(productsRes.data)
    } catch (err: any) {
      if (!silent) toast('Não foi possível carregar os produtos.', 'error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const fetchCategories = useCallback(async () => {
    try {
      const { data } = await api.get('/stores/categories')
      setCategories(data)
    } finally {
      setCategoriesLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchCategories() }, [fetchCategories])

  async function handleToggle(id: string) {
    try {
      const { data } = await api.patch(`/products/${id}/toggle`)
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: data.isActive } : p)))
    } catch {
      toast('Não foi possível alterar o status do produto.', 'error')
    }
  }

  function handleEdit(product: Product) {
    setEditingProduct(product)
    setModalVisible(true)
  }

  function handleAdd() {
    setEditingProduct(null)
    setModalVisible(true)
  }

  function handleDelete(id: string) {
    Alert.alert('Excluir produto', 'O produto ficará inativo e não será exibido aos clientes.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/products/${id}`)
            // Only remove from state AFTER API confirms
            setProducts((prev) => prev.filter((p) => p.id !== id))
          } catch (err: any) {
            Alert.alert('Erro', err.response?.data?.message ?? 'Não foi possível excluir o produto.')
          }
        },
      },
    ])
  }

  async function handleDuplicate(id: string) {
    try {
      const { data } = await api.post(`/products/${id}/duplicate`)
      setProducts((prev) => [...prev, data])
      toast(`"${data.name}" criado como inativo. Edite e ative quando quiser.`, 'success')
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Não foi possível duplicar o produto.', 'error')
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)))
    }
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  async function handleBulkSave() {
    if (selectedIds.size === 0) return
    setBulkSaving(true)
    try {
      const ids = [...selectedIds]
      const body: Record<string, any> = { productIds: ids }
      if (bulkPrice) body.basePrice = parseFloat(bulkPrice.replace(',', '.'))
      if (bulkStock) body.stock = parseInt(bulkStock, 10)
      if (bulkActive !== 'unchanged') body.isActive = bulkActive === 'yes'

      await api.patch('/products/bulk/update', body)

      // Update local state immediately
      setProducts(prev => prev.map(p => {
        if (!ids.includes(p.id)) return p
        return {
          ...p,
          ...(bulkPrice ? { basePrice: parseFloat(bulkPrice.replace(',', '.')) } : {}),
          ...(bulkStock ? { stock: parseInt(bulkStock, 10) } : {}),
          ...(bulkActive !== 'unchanged' ? { isActive: bulkActive === 'yes' } : {}),
        }
      }))

      setBulkModalVisible(false)
      setBulkPrice(''); setBulkStock(''); setBulkActive('unchanged')
      exitSelectMode()
      toast(`${ids.length} produto${ids.length > 1 ? 's' : ''} atualizado${ids.length > 1 ? 's' : ''}.`, 'success')
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Não foi possível atualizar os produtos.', 'error')
    } finally {
      setBulkSaving(false)
    }
  }

  function handleVariationCountChange(productId: string, count: number) {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, hasVariations: count > 0 } : p))
    )
  }

  async function handleSave(form: ProductFormState) {
    if (!form.name.trim()) {
      toast('Informe o nome do produto.', 'error')
      return
    }
    if (!form.categoryId) {
      toast('Selecione uma categoria.', 'error')
      return
    }

    const payload: any = {
      name: form.name.trim(),
      categoryId: form.categoryId,
    }
    if (form.basePrice) payload.basePrice = parseFloat(form.basePrice.replace(',', '.'))
    // Vazio manda null: no backend isso significa "tirar a oferta".
    payload.comparePrice = form.comparePrice
      ? parseFloat(form.comparePrice.replace(',', '.'))
      : null
    // Campo vazio = enviar null pra LIMPAR (estoque ilimitado / sem limite de distância).
    // Antes usava `if (form.stock)` — string vazia é falsy, então nunca voltava pra ilimitado.
    payload.stock = form.stock.trim() === '' ? null : parseInt(form.stock, 10)
    payload.maxDeliveryKm = form.maxDeliveryKm.trim() === '' ? null : parseFloat(form.maxDeliveryKm.replace(',', '.'))
    if (form.imageUrl) payload.imageUrl = form.imageUrl

    // Promoção "Leve X Pague Y": envia os dois ou limpa (null). Valida X > Y.
    const hasPromo = form.promoBuyQty.trim() !== '' || form.promoPayQty.trim() !== ''
    if (hasPromo) {
      const buy = parseInt(form.promoBuyQty, 10)
      const pay = parseInt(form.promoPayQty, 10)
      if (!buy || !pay || buy < 2 || pay < 1 || buy <= pay) {
        toast('Preencha "Leve" e "Pague" com "Leve" maior que "Pague". Ex.: Leve 3, Pague 2.', 'error')
        return
      }
      payload.promoBuyQty = buy
      payload.promoPayQty = pay
    } else {
      payload.promoBuyQty = null
      payload.promoPayQty = null
    }

    setSaving(true)
    try {
      if (editingProduct) {
        const { data } = await api.patch(`/products/${editingProduct.id}`, payload)
        setProducts((prev) => prev.map((p) => (p.id === editingProduct.id ? { ...p, ...data } : p)))
      } else {
        if (!storeId) throw new Error('Store not loaded')
        const { data } = await api.post(`/products/store/${storeId}`, payload)
        setProducts((prev) => [...prev, data])
      }
      setModalVisible(false)
    } catch (err: any) {
      toast(err.response?.data?.message ?? 'Não foi possível salvar o produto.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category?.name.toLowerCase().includes(search.toLowerCase())
  )

  const activeCount = products.filter((p) => p.isActive).length

  const editInitial: ProductFormState | undefined = editingProduct ? {
    name: editingProduct.name,
    categoryId: editingProduct.category?.id ?? '',
    basePrice: editingProduct.basePrice != null ? String(editingProduct.basePrice) : '',
    comparePrice: editingProduct.comparePrice != null ? String(editingProduct.comparePrice) : '',
    stock: editingProduct.stock != null ? String(editingProduct.stock) : '',
    imageUrl: editingProduct.imageUrl ?? '',
    maxDeliveryKm: (editingProduct as any).maxDeliveryKm != null ? String((editingProduct as any).maxDeliveryKm) : '',
    promoBuyQty: editingProduct.promoBuyQty != null ? String(editingProduct.promoBuyQty) : '',
    promoPayQty: editingProduct.promoPayQty != null ? String(editingProduct.promoPayQty) : '',
  } : undefined

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        {selectMode ? (
          <>
            <TouchableOpacity onPress={toggleSelectAll} style={styles.selectAllBtn} activeOpacity={0.8}>
              <Ionicons
                name={selectedIds.size === filtered.length && filtered.length > 0 ? 'checkbox' : 'square-outline'}
                size={20} color={colors.primary}
              />
              <Text style={styles.selectAllText}>
                {selectedIds.size > 0 ? `${selectedIds.size} selecionado${selectedIds.size > 1 ? 's' : ''}` : 'Selecionar todos'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelSelectBtn} onPress={exitSelectMode} activeOpacity={0.8}>
              <Text style={styles.cancelSelectText}>Cancelar</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={16} color="#9A8880" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar produto..."
                placeholderTextColor="#C0B0A8"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={16} color="#9A8880" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={styles.selectBtn} onPress={() => setSelectMode(true)} activeOpacity={0.8}>
              <Ionicons name="checkmark-done-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={handleAdd} activeOpacity={0.85}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          <Text style={styles.statsNum}>{products.length}</Text> produtos ·{' '}
          <Text style={styles.statsNum}>{activeCount}</Text> ativos
        </Text>
      </View>

      {loading ? (
        <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          <View style={styles.productGrid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={[styles.skeletonCard]}>
                <View style={styles.skeletonImage} />
                <View style={{ padding: 10, gap: 8 }}>
                  <View style={[styles.skeletonLine, { width: '70%' }]} />
                  <View style={[styles.skeletonLine, { width: '40%' }]} />
                  <View style={[styles.skeletonLine, { width: '55%' }]} />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchData() }}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="cube-outline" size={40} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>
                {search ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
              </Text>
              {!search && (
                <TouchableOpacity style={styles.emptyBtn} onPress={handleAdd} activeOpacity={0.85}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.emptyBtnText}>Adicionar produto</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.productGrid}>
              {filtered.map((product) => (
                <TouchableOpacity
                  key={product.id}
                  activeOpacity={selectMode ? 0.7 : 1}
                  onPress={selectMode ? () => toggleSelect(product.id) : undefined}
                  onLongPress={() => { setSelectMode(true); toggleSelect(product.id) }}
                  style={{ position: 'relative' }}
                >
                  {selectMode && (
                    <View style={styles.checkboxOverlay}>
                      <View style={[styles.checkbox, selectedIds.has(product.id) && styles.checkboxSelected]}>
                        {selectedIds.has(product.id) && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                    </View>
                  )}
                  <ProductCard
                    product={product}
                    onToggle={selectMode ? () => {} : handleToggle}
                    onEdit={selectMode ? () => {} : handleEdit}
                    onDelete={selectMode ? () => {} : handleDelete}
                    onVariations={selectMode ? () => {} : setVariationsProduct}
                    onDuplicate={selectMode ? () => {} : handleDuplicate}
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <ProductModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        categories={categories}
        categoriesLoading={categoriesLoading}
        initial={editInitial}
        saving={saving}
      />

      <VariationsModal
        visible={!!variationsProduct}
        productId={variationsProduct?.id ?? ''}
        productName={variationsProduct?.name ?? ''}
        onClose={() => setVariationsProduct(null)}
        onCountChange={handleVariationCountChange}
      />

      {/* Bulk action bottom bar */}
      {selectMode && selectedIds.size > 0 && (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkBarText}>{selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}</Text>
          <TouchableOpacity
            style={styles.bulkEditBtn}
            onPress={() => setBulkModalVisible(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="create-outline" size={16} color="#fff" />
            <Text style={styles.bulkEditBtnText}>Editar em lote</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bulk edit modal */}
      <Modal visible={bulkModalVisible} animationType="slide" transparent onRequestClose={() => setBulkModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.bulkModal}>
            <View style={styles.bulkModalHandle} />
            <Text style={styles.bulkModalTitle}>Editar {selectedIds.size} produto{selectedIds.size > 1 ? 's' : ''}</Text>
            <Text style={styles.bulkModalSub}>Preencha apenas os campos que deseja alterar</Text>

            <View style={styles.bulkField}>
              <Text style={styles.bulkLabel}>Preço base (R$)</Text>
              <TextInput
                style={styles.bulkInput}
                value={bulkPrice}
                onChangeText={setBulkPrice}
                placeholder="Deixe vazio para manter"
                placeholderTextColor="#C0B0A8"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.bulkField}>
              <Text style={styles.bulkLabel}>Estoque</Text>
              <TextInput
                style={styles.bulkInput}
                value={bulkStock}
                onChangeText={setBulkStock}
                placeholder="Deixe vazio para manter"
                placeholderTextColor="#C0B0A8"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.bulkField}>
              <Text style={styles.bulkLabel}>Status</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {([['unchanged','Manter','#F0EBE5','#7A6A60'],['yes','Ativar','#D1FAE5','#059669'],['no','Desativar','#FEE2E2','#DC2626']] as const).map(([val, label, bg, color]) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.bulkStatusBtn, { backgroundColor: bg, borderColor: bulkActive === val ? color : 'transparent', borderWidth: 2 }]}
                    onPress={() => setBulkActive(val as any)}
                  >
                    <Text style={[styles.bulkStatusText, { color }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <TouchableOpacity style={styles.bulkCancelBtn} onPress={() => setBulkModalVisible(false)}>
                <Text style={styles.bulkCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bulkSaveBtn, bulkSaving && { opacity: 0.7 }]}
                onPress={handleBulkSave}
                disabled={bulkSaving}
              >
                {bulkSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.bulkSaveText}>Aplicar alterações</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF6F2' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingTop: 24,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#F0EBE5',
  },
  title: { fontSize: 18, fontWeight: '900', color: '#1A0A00' },
  closeBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#F5F0EC',
    alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: 20, paddingBottom: 48 },
  fieldWrap: { marginBottom: 18 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#9A8880', marginBottom: 8, letterSpacing: 0.5 },
  // Aviso abaixo de um campo (ex.: % de desconto da oferta). A cor vem de quem usa.
  fieldHint: { fontSize: 12, marginTop: 6, lineHeight: 16, fontWeight: '600' },
  input: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#EDE5DF',
    paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: '#1A0A00',
  },
  imagePicker: {
    width: 100, height: 100, borderRadius: 16,
    backgroundColor: '#F5F0EC',
    borderWidth: 1.5, borderColor: '#EDE5DF', borderStyle: 'dashed',
    alignSelf: 'center', marginBottom: 20,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  imagePreview: { width: 100, height: 100 },
  // Fundo branco automatico, logo abaixo da foto.
  fundoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    alignSelf: 'center', marginTop: -6, marginBottom: 14,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: '#FFD9C2',
  },
  fundoBtnTexto: { fontSize: 13, fontWeight: '800', color: colors.primary },
  fundoLinha: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: -6, marginBottom: 14,
  },
  fundoOk: { fontSize: 13, fontWeight: '700', color: '#15803D' },
  fundoDesfazer: { fontSize: 13, fontWeight: '800', color: colors.primary, textDecorationLine: 'underline' },
  imageEditBadge: {
    position: 'absolute', bottom: 6, right: 6,
    backgroundColor: colors.primary,
    borderRadius: 12, width: 24, height: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  imagePlaceholder: { alignItems: 'center', gap: 4 },
  imagePlaceholderText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  catLoading: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  catScroll: { flexGrow: 0 },
  catSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1.5, borderColor: '#EDE5DF',
    paddingHorizontal: 12, height: 42, marginBottom: 10,
  },
  catSearchInput: { flex: 1, fontSize: 14, color: '#1A0A00', paddingVertical: 0 },
  catWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  catBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8, marginBottom: 8,
    backgroundColor: '#F0EBE5',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  catBtnActive: { backgroundColor: '#FFF0EB', borderColor: colors.primary },
  catBtnText: { fontSize: 13, fontWeight: '700', color: '#7A6A60' },
  catBtnTextActive: { color: colors.primary },
  infoBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#F5F3FF', borderRadius: 10, padding: 12, marginBottom: 20,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 17 },
  promoMini: { fontSize: 11, fontWeight: '700', color: '#9A8880', marginBottom: 4 },
  promoPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
    backgroundColor: '#DCFCE7', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
  },
  promoPreviewText: { flex: 1, fontSize: 12, color: '#15803D', fontWeight: '700', lineHeight: 16 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 14,
    borderBottomWidth: 3, borderBottomColor: colors.primaryDark,
    shadowColor: colors.primaryDark, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6, minHeight: 56,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
})

const varModal = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF6F2' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    padding: 20, paddingTop: 24, paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#F0EBE5',
    gap: 8,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#1A0A00' },
  headerSub: { fontSize: 12, color: '#9A8880', marginTop: 2 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#7C3AED', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  closeBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#F5F0EC',
    alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: 16, paddingBottom: 48 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#F5F3FF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: '900', color: '#1A0A00', marginBottom: 8 },
  emptyText: { fontSize: 13, color: '#9A8880', textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#7C3AED', paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  list: {
    backgroundColor: '#fff', borderRadius: 16,
    borderWidth: 1, borderColor: '#F0EBE5',
    overflow: 'hidden', marginBottom: 16,
  },
  varRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    gap: 6,
  },
  varRowBorder: { borderTopWidth: 1, borderTopColor: '#F0EBE5' },
  varRowInactive: { opacity: 0.55 },
  varNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' },
  varName: { fontSize: 14, fontWeight: '800', color: '#1A0A00' },
  varNameInactive: { color: '#9A8880' },
  varInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  varPrice: { fontSize: 14, fontWeight: '700', color: colors.primary },
  varStock: { fontSize: 12, color: '#9A8880' },
  sizeChip: { backgroundColor: '#EDE9FE', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  sizeChipText: { fontSize: 10, fontWeight: '700', color: '#7C3AED' },
  colorChip: { backgroundColor: '#FEE2E2', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  colorChipText: { fontSize: 10, fontWeight: '700', color: '#B91C1C' },
  inactivePill: { backgroundColor: '#F5F5F5', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  inactivePillText: { fontSize: 10, fontWeight: '700', color: '#9A8880' },
  actionBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#FFF0EB',
    alignItems: 'center', justifyContent: 'center',
  },
  formCard: {
    backgroundColor: '#fff', borderRadius: 16,
    borderWidth: 1, borderColor: '#F0EBE5',
    padding: 16, marginTop: 4,
  },
  formTitle: { fontSize: 15, fontWeight: '900', color: '#1A0A00', marginBottom: 16 },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12,
    backgroundColor: '#F0EBE5',
  },
  cancelBtnText: { color: '#7A6A60', fontWeight: '700', fontSize: 15 },
})

const card = StyleSheet.create({
  container: {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  inactive: { opacity: 0.6 },
  image: { width: '100%', height: 90 },
  imagePlaceholder: { height: 90, backgroundColor: '#FFF0EB', alignItems: 'center', justifyContent: 'center' },
  body: { padding: 12 },
  topRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  categoryBadge: { backgroundColor: '#F0EBE5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  categoryText: { fontSize: 10, fontWeight: '700', color: '#7A6A60' },
  variationsBadge: { backgroundColor: '#EDE9FE', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  variationsText: { fontSize: 10, fontWeight: '700', color: '#7C3AED' },
  name: { fontSize: 14, fontWeight: '800', color: '#1A0A00', lineHeight: 18, marginBottom: 8 },
  nameInactive: { color: '#9A8880' },
  blockedBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 5,
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 6, marginBottom: 8,
  },
  blockedText: { flex: 1, fontSize: 11, fontWeight: '600', color: '#B91C1C', lineHeight: 15 },
  bottomRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 },
  price: { fontSize: 16, fontWeight: '900', color: colors.primary },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  stockText: { fontSize: 11, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 6 },
  editBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: '#FFF0EB',
  },
  editBtnText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  variationsBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: '#EDE9FE',
  },
  variationsBtnText: { fontSize: 11, fontWeight: '700', color: '#7C3AED' },
  duplicateBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
})

const styles = StyleSheet.create({
  // Seleção múltipla, edição em lote e skeleton — estavam no StyleSheet `card`
  // por engano, então `styles.X` vinha undefined e tudo renderizava sem estilo.
  skeletonCard: {
    backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: '#F0E8E0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, elevation: 1,
  },
  skeletonImage: { height: 100, backgroundColor: '#F0EBE5' },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: '#F0EBE5' },

  selectBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#FFF0EB', alignItems: 'center', justifyContent: 'center', marginRight: 6,
  },
  selectAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  selectAllText: { fontSize: 14, fontWeight: '700', color: '#1A0A00' },
  cancelSelectBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  cancelSelectText: { fontSize: 14, fontWeight: '700', color: '#9A8880' },

  checkboxOverlay: { position: 'absolute', top: 8, left: 8, zIndex: 10 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: '#C0B0A8', backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },

  bulkBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1A0A00', paddingHorizontal: 16, paddingVertical: 14,
  },
  bulkBarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  bulkEditBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9,
  },
  bulkEditBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  bulkModal: {
    backgroundColor: '#FAF6F2', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  bulkModalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E0D8D0', alignSelf: 'center', marginBottom: 20 },
  bulkModalTitle: { fontSize: 20, fontWeight: '900', color: '#1A0A00', marginBottom: 4 },
  bulkModalSub: { fontSize: 13, color: '#9A8880', marginBottom: 20 },
  bulkField: { marginBottom: 16 },
  bulkLabel: { fontSize: 12, fontWeight: '700', color: '#9A8880', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  bulkInput: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#EDE5DF',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1A0A00',
  },
  bulkStatusBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  bulkStatusText: { fontSize: 13, fontWeight: '800' },
  bulkCancelBtn: { flex: 1, backgroundColor: '#F0EBE5', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  bulkCancelText: { fontSize: 15, fontWeight: '700', color: '#7A6A60' },
  bulkSaveBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  bulkSaveText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  toolbar: {
    flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0EBE5',
  },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F5F0EC', borderRadius: 12, paddingHorizontal: 12, height: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#1A0A00' },
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },

  statsBar: {
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0EBE5',
  },
  statsText: { fontSize: 13, color: '#9A8880' },
  statsNum: { color: '#1A0A00', fontWeight: '800' },

  grid: { padding: 16 },
  productGrid: { gap: 12 },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: '#FFF0EB',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#1A0A00', marginBottom: 16 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
})
