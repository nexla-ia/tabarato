'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, X, Ticket } from 'lucide-react'
import { api } from '@/lib/api'
import { Coupon } from '@/lib/types'
import { formatMoneyInput, moneyInputToNumber, onlyDigits } from '@/lib/masks'
import styles from './page.module.css'

type DiscountType = 'percent' | 'fixed'

interface FormState {
  id?: string
  code: string
  description: string
  discountType: DiscountType
  discountPercent: string
  discountFixed: string // dígitos crus em centavos, igual ao preço de produto
  minOrderValue: string // idem
  maxUses: string
  expiresAt: string // yyyy-mm-dd
  isActive: boolean
}

const EMPTY: FormState = {
  code: '', description: '', discountType: 'percent',
  discountPercent: '', discountFixed: '', minOrderValue: '', maxUses: '', expiresAt: '', isActive: true,
}

function money(v: number | string | null | undefined) {
  return `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}`
}

export default function CuponsPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState | null>(null)
  const [error, setError] = useState('')

  const couponsQ = useQuery<Coupon[]>({ queryKey: ['coupons-my'], queryFn: async () => (await api.get('/coupons')).data })

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = {
        code: f.code.trim().toUpperCase(),
        description: f.description.trim() || undefined,
        discountPercent: f.discountType === 'percent' ? Number(f.discountPercent) || undefined : null,
        discountFixed: f.discountType === 'fixed' ? moneyInputToNumber(f.discountFixed) : null,
        minOrderValue: f.minOrderValue ? moneyInputToNumber(f.minOrderValue) : null,
        maxUses: f.maxUses === '' ? null : Number(f.maxUses),
        expiresAt: f.expiresAt || null,
        isActive: f.isActive,
      }
      if (f.id) return (await api.patch(`/coupons/${f.id}`, payload)).data
      return (await api.post('/coupons', payload)).data
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['coupons-my'] }); setForm(null); setError('') },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Não foi possível salvar o cupom'),
  })

  const toggle = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/coupons/${id}/toggle`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coupons-my'] }),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/coupons/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coupons-my'] }),
  })

  const coupons = couponsQ.data ?? []

  function edit(c: Coupon) {
    setError('')
    setForm({
      id: c.id,
      code: c.code,
      description: c.description ?? '',
      discountType: c.discountFixed ? 'fixed' : 'percent',
      discountPercent: c.discountPercent ? String(Number(c.discountPercent)) : '',
      discountFixed: c.discountFixed ? String(Math.round(Number(c.discountFixed) * 100)) : '',
      minOrderValue: c.minOrderValue ? String(Math.round(Number(c.minOrderValue) * 100)) : '',
      maxUses: c.maxUses == null ? '' : String(c.maxUses),
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : '',
      isActive: c.isActive,
    })
  }

  function openNew() {
    setError('')
    setForm({ ...EMPTY })
  }

  function discountLabel(c: Coupon) {
    if (c.discountPercent) return `${Number(c.discountPercent)}% de desconto`
    if (c.discountFixed) return `${money(c.discountFixed)} de desconto`
    return '—'
  }

  const isExpired = (c: Coupon) => !!c.expiresAt && new Date(c.expiresAt) < new Date()
  const canSave = !!form?.code.trim() && (
    form.discountType === 'percent' ? !!form.discountPercent : !!form.discountFixed
  )

  return (
    <div>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Cupons</h1>
          <p className={styles.subtitle}>{coupons.length} cupom{coupons.length === 1 ? '' : 's'} cadastrado{coupons.length === 1 ? '' : 's'}</p>
        </div>
        <button className={styles.newBtn} onClick={openNew}>
          <Plus size={17} /> Novo cupom
        </button>
      </div>

      {couponsQ.isLoading ? (
        <div className={styles.empty}>Carregando…</div>
      ) : coupons.length === 0 ? (
        <div className={styles.empty}>
          <Ticket size={32} strokeWidth={1.5} />
          <p>Nenhum cupom ainda. Crie o primeiro pra atrair clientes!</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {coupons.map((c) => {
            const expired = isExpired(c)
            return (
              <div key={c.id} className={`${styles.card} ${!c.isActive ? styles.inactive : ''}`}>
                <div className={styles.thumb}>
                  <Ticket size={22} strokeWidth={1.5} />
                </div>
                <div className={styles.info}>
                  <div className={styles.pCode}>{c.code}</div>
                  <div className={styles.pDiscount}>{discountLabel(c)}</div>
                  <div className={styles.pMeta}>
                    {c.minOrderValue ? <span>mín. {money(c.minOrderValue)}</span> : null}
                    <span>{c.usedCount}{c.maxUses != null ? `/${c.maxUses}` : ''} uso{c.usedCount === 1 && c.maxUses == null ? '' : 's'}</span>
                    {c.expiresAt && <span className={expired ? styles.pExpired : undefined}>{expired ? 'expirado em' : 'até'} {new Date(c.expiresAt).toLocaleDateString('pt-BR')}</span>}
                    {!c.isActive && <span className={styles.pInactive}>· inativo</span>}
                  </div>
                </div>
                <div className={styles.cardActions}>
                  <label className={styles.switch}>
                    <input type="checkbox" checked={c.isActive} onChange={() => toggle.mutate(c.id)} />
                    <span className={styles.slider} />
                  </label>
                  <button className={styles.iconBtn} onClick={() => edit(c)} title="Editar"><Pencil size={15} /></button>
                  <button
                    className={`${styles.iconBtn} ${styles.danger}`}
                    onClick={() => { if (confirm(`Excluir o cupom "${c.code}"?`)) remove.mutate(c.id) }}
                    title="Excluir"
                  ><Trash2 size={15} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {form && (
        <div className={styles.overlay} onClick={() => setForm(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3>{form.id ? 'Editar cupom' : 'Novo cupom'}</h3>
              <button onClick={() => setForm(null)}><X size={18} /></button>
            </div>

            <label className={styles.label}>Código *</label>
            <input
              className={styles.input}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="Ex.: BEMVINDO10"
              maxLength={30}
            />

            <label className={styles.label}>Descrição</label>
            <input
              className={styles.input}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ex.: 10% de desconto pra clientes novos"
            />

            <label className={styles.label}>Tipo de desconto</label>
            <div className={styles.typeRow}>
              <button
                type="button"
                className={`${styles.typeBtn} ${form.discountType === 'percent' ? styles.typeBtnActive : ''}`}
                onClick={() => setForm({ ...form, discountType: 'percent' })}
              >
                Percentual (%)
              </button>
              <button
                type="button"
                className={`${styles.typeBtn} ${form.discountType === 'fixed' ? styles.typeBtnActive : ''}`}
                onClick={() => setForm({ ...form, discountType: 'fixed' })}
              >
                Valor fixo (R$)
              </button>
            </div>

            {form.discountType === 'percent' ? (
              <>
                <label className={styles.label}>Desconto (%) *</label>
                <input
                  className={styles.input} type="number" min={1} max={100}
                  value={form.discountPercent}
                  onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                  placeholder="Ex.: 10"
                />
              </>
            ) : (
              <>
                <label className={styles.label}>Desconto (R$) *</label>
                <input
                  className={styles.input} inputMode="numeric"
                  value={formatMoneyInput(form.discountFixed)}
                  onChange={(e) => setForm({ ...form, discountFixed: onlyDigits(e.target.value) })}
                  placeholder="0,00"
                />
              </>
            )}

            <div className={styles.row}>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>Pedido mínimo (R$)</label>
                <input
                  className={styles.input} inputMode="numeric"
                  value={formatMoneyInput(form.minOrderValue)}
                  onChange={(e) => setForm({ ...form, minOrderValue: onlyDigits(e.target.value) })}
                  placeholder="vazio = sem mínimo"
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className={styles.label}>Limite de usos</label>
                <input
                  className={styles.input} type="number" min={1}
                  value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                  placeholder="vazio = ilimitado"
                />
              </div>
            </div>

            <label className={styles.label}>Válido até</label>
            <input
              className={styles.input} type="date"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
            <p className={styles.hint}>Deixe em branco pra não expirar.</p>

            <label className={styles.checkRow}>
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Cupom ativo (utilizável pelos clientes)
            </label>

            {error && <p className={styles.err}>{error}</p>}

            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setForm(null)}>Cancelar</button>
              <button
                className={styles.modalConfirm}
                onClick={() => save.mutate(form)}
                disabled={save.isPending || !canSave}
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
