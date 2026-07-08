'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, X, Package } from 'lucide-react'
import { api } from '@/lib/api'
import { Product, Store, Category, money } from '@/lib/types'
import styles from './page.module.css'

interface FormState {
  id?: string
  name: string
  description: string
  basePrice: string
  stock: string
  categoryId: string
  imageUrl: string
  isActive: boolean
}

const EMPTY: FormState = { name: '', description: '', basePrice: '', stock: '', categoryId: '', imageUrl: '', isActive: true }

export default function ProdutosPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState | null>(null)

  const storeQ = useQuery<Store>({ queryKey: ['store-my'], queryFn: async () => (await api.get('/stores/my')).data })
  const productsQ = useQuery<Product[]>({ queryKey: ['products-my'], queryFn: async () => (await api.get('/products/my')).data })
  const catsQ = useQuery<Category[]>({ queryKey: ['categories'], queryFn: async () => (await api.get('/stores/categories')).data })

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = {
        name: f.name,
        description: f.description || undefined,
        basePrice: Number(f.basePrice),
        stock: f.stock === '' ? null : Number(f.stock),
        categoryId: f.categoryId || undefined,
        imageUrl: f.imageUrl || undefined,
        isActive: f.isActive,
      }
      if (f.id) return (await api.patch(`/products/${f.id}`, payload)).data
      return (await api.post(`/products/store/${storeQ.data!.id}`, payload)).data
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products-my'] }); setForm(null) },
  })
  const toggle = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/products/${id}/toggle`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products-my'] }),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/products/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products-my'] }),
  })

  const products = productsQ.data ?? []

  function edit(p: Product) {
    setForm({
      id: p.id, name: p.name, description: p.description ?? '',
      basePrice: String(Number(p.basePrice)), stock: p.stock == null ? '' : String(p.stock),
      categoryId: p.categoryId ?? '', imageUrl: p.imageUrl ?? '', isActive: p.isActive,
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
        <div className={styles.empty}>Carregando…</div>
      ) : products.length === 0 ? (
        <div className={styles.empty}>
          <Package size={32} strokeWidth={1.5} />
          <p>Nenhum produto ainda. Crie o primeiro!</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {products.map(p => (
            <div key={p.id} className={`${styles.card} ${!p.isActive ? styles.inactive : ''}`}>
              <div className={styles.thumb}>
                {p.imageUrl ? <img src={p.imageUrl} alt={p.name} /> : <Package size={26} strokeWidth={1.5} />}
              </div>
              <div className={styles.info}>
                <div className={styles.pName}>{p.name}</div>
                <div className={styles.pPrice}>{money(p.basePrice)}</div>
                <div className={styles.pMeta}>
                  {p.stock == null ? 'Estoque livre' : `${p.stock} un.`}
                  {!p.isActive && <span className={styles.pInactive}>· inativo</span>}
                </div>
              </div>
              <div className={styles.cardActions}>
                <label className={styles.switch}>
                  <input type="checkbox" checked={p.isActive} onChange={() => toggle.mutate(p.id)} />
                  <span className={styles.slider} />
                </label>
                <button className={styles.iconBtn} onClick={() => edit(p)} title="Editar"><Pencil size={15} /></button>
                <button
                  className={`${styles.iconBtn} ${styles.danger}`}
                  onClick={() => { if (confirm(`Excluir "${p.name}"?`)) remove.mutate(p.id) }}
                  title="Excluir"
                ><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
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
                <input className={styles.input} type="number" step="0.01" value={form.basePrice} onChange={e => setForm({ ...form, basePrice: e.target.value })} placeholder="0,00" />
              </div>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>Estoque</label>
                <input className={styles.input} type="number" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} placeholder="vazio = livre" />
              </div>
            </div>

            <label className={styles.label}>Categoria</label>
            <select className={styles.input} value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">Sem categoria</option>
              {(catsQ.data ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <label className={styles.label}>URL da imagem</label>
            <input className={styles.input} value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://…" />

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
