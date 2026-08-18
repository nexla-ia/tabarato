'use client'
import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, X, Package, Camera, Loader2, Minus, TriangleAlert } from 'lucide-react'
import { api } from '@/lib/api'
import { Product, Store, Category, money } from '@/lib/types'
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
}

const EMPTY: FormState = { name: '', description: '', basePrice: '', stock: '', categoryId: '', imageUrl: '', images: [], isActive: true }

export default function ProdutosPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState | null>(null)
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
      const payload = {
        name: f.name,
        description: f.description || undefined,
        basePrice: moneyInputToNumber(f.basePrice),
        stock: f.stock === '' ? null : Number(f.stock),
        categoryId: f.categoryId || undefined,
        imageUrl: f.imageUrl || undefined,
        images: f.images,
        isActive: f.isActive,
      }
      if (f.id) return (await api.patch(`/products/${f.id}`, payload)).data
      return (await api.post(`/products/store/${storeQ.data!.id}`, payload)).data
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products-my'] }); setForm(null) },
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
    </div>
  )
}
