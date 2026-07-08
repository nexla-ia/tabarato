'use client'
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { api } from '@/lib/api'
import { Store } from '@/lib/types'
import styles from './page.module.css'

export default function ConfigPage() {
  const qc = useQueryClient()
  const storeQ = useQuery<Store>({ queryKey: ['store-my'], queryFn: async () => (await api.get('/stores/my')).data })

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [phone, setPhone] = useState('')
  const [radius, setRadius] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const s = storeQ.data
    if (!s) return
    setName(s.name ?? '')
    setDescription(s.description ?? '')
    setPhone(s.phone ?? '')
    setRadius(s.deliveryRadiusKm != null ? String(s.deliveryRadiusKm) : '')
  }, [storeQ.data])

  const save = useMutation({
    mutationFn: async () => (await api.patch('/stores/my', {
      name,
      description: description || undefined,
      phone: phone || undefined,
      deliveryRadiusKm: radius === '' ? undefined : Number(radius),
    })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-my'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  if (storeQ.isLoading) return <div className={styles.loading}>Carregando…</div>

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Configurações da loja</h1>
      <p className={styles.subtitle}>Dados que aparecem para os clientes</p>

      <div className={styles.card}>
        <label className={styles.label}>Nome da loja</label>
        <input className={styles.input} value={name} onChange={e => setName(e.target.value)} />

        <label className={styles.label}>Descrição</label>
        <textarea className={styles.input} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Conte sobre sua loja…" />

        <label className={styles.label}>Telefone / WhatsApp</label>
        <input className={styles.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(69) 99999-9999" />

        <label className={styles.label}>Raio de entrega (km)</label>
        <input className={styles.input} type="number" step="0.5" value={radius} onChange={e => setRadius(e.target.value)} placeholder="Ex.: 8" />
        <p className={styles.hint}>Clientes fora desse raio não verão sua loja.</p>

        <button className={styles.saveBtn} onClick={() => save.mutate()} disabled={save.isPending || !name}>
          {saved ? <><Check size={17} /> Salvo!</> : save.isPending ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  )
}
