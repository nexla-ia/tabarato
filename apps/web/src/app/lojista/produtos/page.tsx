'use client'
import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, X, Package, Camera, Loader2, Minus, TriangleAlert, Layers } from 'lucide-react'
import { api } from '@/lib/api'
import { Product, ProductVariation, Store, Category, money } from '@/lib/types'
import { formatMoneyInput, moneyInputToNumber, onlyDigits } from '@/lib/masks'
import { CategorySelect } from '@/components/CategorySelect'
import { Spinner } from '@/components/Spinner'
import styles from './page.module.css'

const MAX_GALLERY_IMAGES = 8

interface FormState {
  id?: string
  name: string
  description: string
  basePrice: string // dígitos crus em centavos (máscara "de trás pra frente")
  stock: string
  categoryId: string
  imageUrl: string
  images: string[]
  isActive: boolean
  promoBuyQty: string
  promoPayQty: string
}

const EMPTY: FormState = { name: '', description: '', basePrice: '', stock: '', categoryId: '', imageUrl: '', images: [], isActive: true, promoBuyQty: '', promoPayQty: '' }

export default function ProdutosPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState | null>(null)
  const [variationsProduct, setVariationsProduct] = useState<Product | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageError, setImageError] = useState('')
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [uploadingGallery, setUploadingGallery] = useState(false)
  const [galleryError, setGalleryError] = useState('')
  const galleryInputRef = useRef<HTMLInputElement>(null)

  const storeQ = useQuery<Store>({ queryKey: ['store-my'], queryFn: async () => (await api.get('/stores/my')).data })
  const productsQ = useQuery<Product[]>({ queryKey: ['products-my'], queryFn: async () => (await api.get('/products/my')).data })
  const catsQ = useQuery<Category[]>({ queryKey: ['categories'], queryFn: async () => (await api.get('/stores/categories')).data })

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      // Promoção "Leve X Pague Y": envia os dois ou limpa (null). Valida X > Y.
      let promoBuyQty: number | null = null
      let promoPayQty: number | null = null
      if (f.promoBuyQty.trim() !== '' || f.promoPayQty.trim() !== '') {
        const buy = parseInt(f.promoBuyQty, 10)
        const pay = parseInt(f.promoPayQty, 10)
        if (!buy || !pay || buy < 2 || pay < 1 || buy <= pay) {
          throw new Error('Promoção inválida: "Leve" deve ser maior que "Pague" (ex.: Leve 3, Pague 2).')
        }
        promoBuyQty = buy
        promoPayQty = pay
      }
      const payload = {
        name: f.name,
        description: f.description || undefined,
        basePrice: moneyInputToNumber(f.basePrice),
        stock: f.stock === '' ? null : Number(f.stock),
        categoryId: f.categoryId || undefined,
        imageUrl: f.imageUrl || undefined,
        images: f.images,
        isActive: f.isActive,
        promoBuyQty,
        promoPayQty,
      }
      if (f.id) return (await api.patch(`/products/${f.id}`, payload)).data
      return (await api.post(`/products/store/${storeQ.data!.id}`, payload)).data
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products-my'] }); setForm(null) },
    onError: (e: any) => alert(e?.response?.data?.message ?? e?.message ?? 'Não foi possível salvar o produto.'),
  })

  async function handleImageFile(file: File) {
    setImageError('')
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post<{ url: string }>('/uploads/image', formData)
      setForm((f) => f && { ...f, imageUrl: data.url })
    } catch {
      setImageError('Não foi possível enviar a imagem. Use JPEG, PNG ou WEBP de até 10MB.')
    } finally {
      setUploadingImage(false)
    }
  }

  async function handleGalleryFile(file: File) {
    setGalleryError('')
    setUploadingGallery(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post<{ url: string }>('/uploads/image', formData)
      setForm((f) => f && { ...f, images: [...f.images, data.url] })
    } catch {
      setGalleryError('Não foi possível enviar a imagem. Use JPEG, PNG ou WEBP de até 10MB.')
    } finally {
      setUploadingGallery(false)
    }
  }
  function removeGalleryImage(url: string) {
    setForm((f) => f && { ...f, images: f.images.filter((u) => u !== url) })
  }
  const toggle = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/products/${id}/toggle`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products-my'] }),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/products/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products-my'] }),
  })

  // Ajuste rápido de estoque (+/-) direto no card — o PATCH exige o produto
  // inteiro (nome/categoria não são opcionais no DTO), então reenvia tudo.
  const adjustStock = useMutation({
    mutationFn: async ({ p, stock }: { p: Product; stock: number }) =>
      (await api.patch(`/products/${p.id}`, {
        name: p.name,
        description: p.description || undefined,
        basePrice: Number(p.basePrice),
        stock,
        categoryId: p.categoryId,
        imageUrl: p.imageUrl || undefined,
        images: p.images ?? [],
        isActive: p.isActive,
      })).data,
    onMutate: async ({ p, stock }) => {
      await qc.cancelQueries({ queryKey: ['products-my'] })
      const prev = qc.getQueryData<Product[]>(['products-my'])
      qc.setQueryData<Product[]>(['products-my'], (old) =>
        old?.map((x) => (x.id === p.id ? { ...x, stock } : x)))
      return { prev }
    },
    onError: (_err, _vars, ctx) => { if (ctx?.prev) qc.setQueryData(['products-my'], ctx.prev) },
    onSettled: () => qc.invalidateQueries({ queryKey: ['products-my'] }),
  })

  const products = productsQ.data ?? []

  function edit(p: Product) {
    setForm({
      id: p.id, name: p.name, description: p.description ?? '',
      basePrice: String(Math.round(Number(p.basePrice) * 100)), stock: p.stock == null ? '' : String(p.stock),
      categoryId: p.categoryId ?? '', imageUrl: p.imageUrl ?? '', images: p.images ?? [], isActive: p.isActive,
      promoBuyQty: p.promoBuyQty != null ? String(p.promoBuyQty) : '',
      promoPayQty: p.promoPayQty != null ? String(p.promoPayQty) : '',
    })
  }

  return (
    <div>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Produtos</h1>
          <p className={styles.subtitle}>{products.length} produto{products.length === 1 ? '' : 's'} no catálogo</p>
        </div>
        <button className={styles.newBtn} onClick={() => setForm({ ...EMPTY })}>
          <Plus size={17} /> Novo produto
        </button>
      </div>

      {productsQ.isLoading ? (
        <Spinner />
      ) : products.length === 0 ? (
        <div className={styles.empty}>
          <Package size={32} strokeWidth={1.5} />
          <p>Nenhum produto ainda. Crie o primeiro!</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {products.map(p => {
            const outOfStock = p.stock != null && p.stock <= 0
            return (
            <div key={p.id} className={`${styles.card} ${!p.isActive ? styles.inactive : ''}`}>
              <div className={styles.thumb}>
                {p.imageUrl ? <img src={p.imageUrl} alt={p.name} /> : <Package size={30} strokeWidth={1.5} />}
                {outOfStock ? (
                  <span className={styles.outBadge}><TriangleAlert size={11} /> Esgotado</span>
                ) : !p.isActive ? (
                  <span className={styles.inactiveBadge}>Inativo</span>
                ) : null}
              </div>
              <div className={styles.body}>
                <div className={styles.pName}>{p.name}</div>
                {p.description && <div className={styles.pDesc}>{p.description}</div>}
                <div className={styles.pPrice}>{money(p.basePrice)}</div>

                {p.stock == null ? (
                  <div className={styles.pMeta}>Estoque livre</div>
                ) : (
                  <>
                    <div className={styles.stockRow}>
                      <button
                        className={styles.stepBtn}
                        onClick={() => adjustStock.mutate({ p, stock: Math.max(0, p.stock! - 1) })}
                        disabled={p.stock <= 0}
                        title="Diminuir estoque"
                      ><Minus size={13} /></button>
                      <span className={`${styles.stockVal} ${outOfStock ? styles.stockValOut : ''}`}>{p.stock} un.</span>
                      <button
                        className={styles.stepBtn}
                        onClick={() => adjustStock.mutate({ p, stock: p.stock! + 1 })}
                        title="Aumentar estoque"
                      ><Plus size={13} /></button>
                    </div>
                    {outOfStock && (
                      <div className={styles.outWarning}><TriangleAlert size={12} /> Produto acabou</div>
                    )}
                  </>
                )}
              </div>
              <div className={styles.cardFooter}>
                <label className={styles.switch}>
                  <input type="checkbox" checked={p.isActive} onChange={() => toggle.mutate(p.id)} />
                  <span className={styles.slider} />
                </label>
                <div className={styles.cardActions}>
                  <button
                    className={styles.iconBtn}
                    onClick={() => setVariationsProduct(p)}
                    title="Variações"
                    style={{ position: 'relative' }}
                  >
                    <Layers size={15} />
                    {!!p.variations?.length && (
                      <span style={{
                        position: 'absolute', top: -5, right: -5, background: 'var(--primary, #FF6600)',
                        color: '#fff', fontSize: 9, fontWeight: 800, minWidth: 15, height: 15,
                        borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                      }}>{p.variations.length}</span>
                    )}
                  </button>
                  <button className={styles.iconBtn} onClick={() => edit(p)} title="Editar"><Pencil size={15} /></button>
                  <button
                    className={`${styles.iconBtn} ${styles.danger}`}
                    onClick={() => { if (confirm(`Excluir "${p.name}"?`)) remove.mutate(p.id) }}
                    title="Excluir"
                  ><Trash2 size={15} /></button>
                </div>
              </div>
            </div>
            )
          })}
        </div>
      )}

      {form && (
        <div className={styles.overlay} onClick={() => setForm(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3>{form.id ? 'Editar produto' : 'Novo produto'}</h3>
              <button onClick={() => setForm(null)}><X size={18} /></button>
            </div>

            <label className={styles.label}>Nome *</label>
            <input className={styles.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex.: X-Burger" />

            <label className={styles.label}>Descrição</label>
            <textarea className={styles.input} rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Ingredientes, detalhes…" />

            <div className={styles.row}>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>Preço (R$) *</label>
                <input
                  className={styles.input} inputMode="numeric"
                  value={formatMoneyInput(form.basePrice)}
                  onChange={e => setForm({ ...form, basePrice: onlyDigits(e.target.value) })}
                  placeholder="0,00"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>Estoque</label>
                <input className={styles.input} type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} placeholder="vazio = livre" />
              </div>
            </div>

            <label className={styles.label}>Promoção — Leve X Pague Y (opcional)</label>
            <p className={styles.hint} style={{ marginTop: 0 }}>
              Cliente compra várias unidades e paga por menos. Ex.: leva 3 e paga 2 → a 3ª sai grátis.
            </p>
            <div className={styles.promoSentence}>
              <span>Cliente leva</span>
              <input
                className={styles.promoInput} inputMode="numeric" maxLength={2}
                value={form.promoBuyQty}
                onChange={e => setForm({ ...form, promoBuyQty: onlyDigits(e.target.value) })}
                placeholder="3" aria-label="Quantas unidades o cliente leva"
              />
              <span>e paga</span>
              <input
                className={styles.promoInput} inputMode="numeric" maxLength={2}
                value={form.promoPayQty}
                onChange={e => setForm({ ...form, promoPayQty: onlyDigits(e.target.value) })}
                placeholder="2" aria-label="Quantas unidades o cliente paga"
              />
            </div>
            {form.promoBuyQty && form.promoPayQty && (
              Number(form.promoBuyQty) > Number(form.promoPayQty) ? (
                <p className={styles.promoOk}>
                  🏷️ {Number(form.promoBuyQty) - Number(form.promoPayQty)} unidade(s) grátis a cada {form.promoBuyQty}.
                </p>
              ) : (
                <p className={styles.promoWarn}>
                  ⚠️ "Leva" precisa ser maior que "paga" — do jeito que está, o cliente pagaria por mais unidades do que leva.
                </p>
              )
            )}

            <label className={styles.label}>Categoria</label>
            <CategorySelect
              options={catsQ.data ?? []}
              value={form.categoryId}
              onChange={categoryId => setForm({ ...form, categoryId })}
            />

            <label className={styles.label}>Foto principal</label>
            <div className={styles.imgUploadRow}>
              <div className={styles.imgPreview}>
                {form.imageUrl ? <img src={form.imageUrl} alt="" /> : <Package size={22} strokeWidth={1.5} />}
              </div>
              <div>
                <input
                  ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = '' }}
                />
                <button type="button" className={styles.imgBtn} onClick={() => imageInputRef.current?.click()} disabled={uploadingImage}>
                  {uploadingImage ? <><Loader2 size={14} className={styles.spin} /> Enviando…</> : <><Camera size={14} /> {form.imageUrl ? 'Trocar foto' : 'Enviar foto'}</>}
                </button>
                {imageError && <p className={styles.imgErr}>{imageError}</p>}
              </div>
            </div>

            <label className={styles.label}>Outras fotos do produto ({form.images.length}/{MAX_GALLERY_IMAGES})</label>
            <div className={styles.galleryRow}>
              {form.images.map((url) => (
                <div key={url} className={styles.galleryThumb}>
                  <img src={url} alt="" />
                  <button type="button" className={styles.galleryRemove} onClick={() => removeGalleryImage(url)} title="Remover">
                    <X size={12} />
                  </button>
                </div>
              ))}
              {form.images.length < MAX_GALLERY_IMAGES && (
                <>
                  <input
                    ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleGalleryFile(f); e.target.value = '' }}
                  />
                  <button
                    type="button" className={styles.galleryAdd}
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={uploadingGallery}
                    title="Adicionar foto"
                  >
                    {uploadingGallery ? <Loader2 size={16} className={styles.spin} /> : <Camera size={16} />}
                  </button>
                </>
              )}
            </div>
            {galleryError && <p className={styles.imgErr}>{galleryError}</p>}
            <p className={styles.hint}>A primeira foto (acima) é a capa exibida nas listagens. Estas aparecem na galeria da página do produto.</p>

            <label className={styles.checkRow}>
              <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
              Produto ativo (visível para clientes)
            </label>

            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setForm(null)}>Cancelar</button>
              <button
                className={styles.modalConfirm}
                onClick={() => save.mutate(form)}
                disabled={save.isPending || !form.name || !form.basePrice}
              >
                {save.isPending ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {variationsProduct && (
        <VariationsModal
          product={variationsProduct}
          onClose={() => setVariationsProduct(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ['products-my'] })}
        />
      )}
    </div>
  )
}

// ── Gerenciador de variações (tamanho/cor/preço/estoque) de um produto ──────
interface VarFormState { id?: string; name: string; price: string; size: string; color: string; stock: string }
const EMPTY_VAR: VarFormState = { name: '', price: '', size: '', color: '', stock: '' }

function VariationsModal({ product, onClose, onChanged }: {
  product: Product
  onClose: () => void
  onChanged: () => void
}) {
  const qc = useQueryClient()
  const [vf, setVf] = useState<VarFormState>(EMPTY_VAR)

  const varsQ = useQuery<ProductVariation[]>({
    queryKey: ['variations', product.id],
    queryFn: async () => (await api.get(`/products/${product.id}/variations`)).data,
  })

  function afterChange() {
    qc.invalidateQueries({ queryKey: ['variations', product.id] })
    onChanged()
  }

  const save = useMutation({
    mutationFn: async (f: VarFormState) => {
      const payload = {
        name: f.name.trim(),
        price: moneyInputToNumber(f.price),
        size: f.size.trim() || undefined,
        color: f.color.trim() || undefined,
        stock: f.stock === '' ? undefined : Number(f.stock),
      }
      if (f.id) return (await api.patch(`/products/variations/${f.id}`, payload)).data
      return (await api.post(`/products/${product.id}/variations`, payload)).data
    },
    onSuccess: () => { setVf(EMPTY_VAR); afterChange() },
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Não foi possível salvar a variação.'),
  })
  const toggle = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/products/variations/${id}/toggle`)).data,
    onSuccess: afterChange,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/products/variations/${id}`)).data,
    onSuccess: () => { setVf((f) => (f.id ? EMPTY_VAR : f)); afterChange() },
  })

  const vars = varsQ.data ?? []
  const canSave = vf.name.trim() !== '' && vf.price !== ''

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h3>Variações — {product.name}</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <p className={styles.hint} style={{ marginTop: 0 }}>
          Variações (tamanho, cor, sabor) têm preço e estoque próprios. Quando o produto tem variações, o cliente escolhe uma antes de adicionar.
        </p>

        {/* Lista de variações */}
        {varsQ.isLoading ? (
          <Spinner />
        ) : vars.length === 0 ? (
          <div className={styles.empty} style={{ padding: '20px 0' }}>
            <Layers size={26} strokeWidth={1.5} />
            <p>Nenhuma variação ainda.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {vars.map((v) => (
              <div key={v.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                border: '1px solid var(--border, #eee)', borderRadius: 10, opacity: v.isActive ? 1 : 0.55,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {v.name}
                    {(v.size || v.color) && (
                      <span style={{ fontWeight: 400, color: 'var(--muted, #999)', fontSize: 12 }}>
                        {' '}· {[v.size, v.color].filter(Boolean).join(' / ')}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--muted, #777)' }}>
                    {money(v.price)}{v.stock != null ? ` · ${v.stock} un.` : ' · estoque livre'}
                  </div>
                </div>
                <label className={styles.switch} title={v.isActive ? 'Ativa' : 'Inativa'}>
                  <input type="checkbox" checked={v.isActive} onChange={() => toggle.mutate(v.id)} />
                  <span className={styles.slider} />
                </label>
                <button
                  className={styles.iconBtn}
                  onClick={() => setVf({
                    id: v.id, name: v.name, price: String(Math.round(Number(v.price) * 100)),
                    size: v.size ?? '', color: v.color ?? '', stock: v.stock == null ? '' : String(v.stock),
                  })}
                  title="Editar"
                ><Pencil size={14} /></button>
                <button
                  className={`${styles.iconBtn} ${styles.danger}`}
                  onClick={() => { if (confirm(`Excluir a variação "${v.name}"?`)) remove.mutate(v.id) }}
                  title="Excluir"
                ><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Form add/editar */}
        <div style={{ borderTop: '1px solid var(--border, #eee)', paddingTop: 14 }}>
          <label className={styles.label}>{vf.id ? 'Editar variação' : 'Nova variação'}</label>
          <input
            className={styles.input} value={vf.name}
            onChange={e => setVf({ ...vf, name: e.target.value })}
            placeholder="Nome (ex.: Grande, 500ml, Azul) *"
          />
          <div className={styles.row}>
            <div style={{ flex: 1 }}>
              <label className={styles.label}>Preço (R$) *</label>
              <input
                className={styles.input} inputMode="numeric"
                value={formatMoneyInput(vf.price)}
                onChange={e => setVf({ ...vf, price: onlyDigits(e.target.value) })}
                placeholder="0,00"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className={styles.label}>Estoque</label>
              <input
                className={styles.input} type="number" value={vf.stock}
                onChange={e => setVf({ ...vf, stock: e.target.value })}
                placeholder="vazio = livre"
              />
            </div>
          </div>
          <div className={styles.row}>
            <div style={{ flex: 1 }}>
              <label className={styles.label}>Tamanho</label>
              <input className={styles.input} value={vf.size} onChange={e => setVf({ ...vf, size: e.target.value })} placeholder="opcional" />
            </div>
            <div style={{ flex: 1 }}>
              <label className={styles.label}>Cor</label>
              <input className={styles.input} value={vf.color} onChange={e => setVf({ ...vf, color: e.target.value })} placeholder="opcional" />
            </div>
          </div>

          <div className={styles.modalActions}>
            {vf.id && <button className={styles.modalCancel} onClick={() => setVf(EMPTY_VAR)}>Cancelar edição</button>}
            <button
              className={styles.modalConfirm}
              onClick={() => save.mutate(vf)}
              disabled={save.isPending || !canSave}
            >
              {save.isPending ? 'Salvando…' : vf.id ? 'Salvar variação' : 'Adicionar variação'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
