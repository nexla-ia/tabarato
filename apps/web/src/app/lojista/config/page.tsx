'use client'
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, CreditCard, ExternalLink, AlertTriangle, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { Store } from '@/lib/types'
import styles from './page.module.css'

interface MpStatus { enabled: boolean; connected: boolean; mpUserId: string | null }

export default function ConfigPage() {
  const qc = useQueryClient()
  const storeQ = useQuery<Store>({ queryKey: ['store-my'], queryFn: async () => (await api.get('/stores/my')).data })
  const mpQ = useQuery<MpStatus>({ queryKey: ['mp-status'], queryFn: async () => (await api.get('/stores/mp/status')).data })

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [phone, setPhone] = useState('')
  const [radius, setRadius] = useState('')
  const [saved, setSaved] = useState(false)
  const [mpMsg, setMpMsg] = useState<'ok' | 'erro' | null>(null)
  const [connecting, setConnecting] = useState(false)

  // Feedback do retorno do callback do Mercado Pago (?mp=ok|erro)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('mp')
    if (p === 'ok' || p === 'erro') {
      setMpMsg(p)
      qc.invalidateQueries({ queryKey: ['mp-status'] })
      window.history.replaceState({}, '', '/lojista/config')
      setTimeout(() => setMpMsg(null), 6000)
    }
  }, [qc])

  async function connectMp() {
    setConnecting(true)
    try {
      const { data } = await api.get<{ url: string }>('/stores/mp/connect')
      window.location.href = data.url
    } catch {
      setConnecting(false)
      setMpMsg('erro')
    }
  }

  const disconnectMp = useMutation({
    mutationFn: async () => (await api.get('/stores/mp/disconnect')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mp-status'] }),
  })

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

      {/* Pagamentos — Mercado Pago (só aparece quando o marketplace está ativo) */}
      {mpQ.data?.enabled && (
        <div className={styles.card} style={{ marginTop: 16 }}>
          <div className={styles.mpHead}>
            <span className={styles.mpIcon}><CreditCard size={20} /></span>
            <div>
              <div className={styles.mpTitle}>Recebimentos — Mercado Pago</div>
              <div className={styles.mpSub}>Conecte sua conta pra receber o pagamento das vendas direto, automaticamente.</div>
            </div>
          </div>

          {mpMsg === 'ok' && <div className={styles.mpOkMsg}><Check size={15} /> Conta conectada com sucesso!</div>}
          {mpMsg === 'erro' && <div className={styles.mpErrMsg}><AlertTriangle size={15} /> Não foi possível conectar. Tente de novo.</div>}

          {mpQ.data.connected ? (
            <div className={styles.mpConnected}>
              <span className={styles.mpBadgeOk}><Check size={14} /> Conectado</span>
              <button className={styles.mpDisconnect} onClick={() => { if (confirm('Desconectar o Mercado Pago? Você não poderá receber pedidos até reconectar.')) disconnectMp.mutate() }} disabled={disconnectMp.isPending}>
                Desconectar
              </button>
            </div>
          ) : (
            <>
              <div className={styles.mpWarn}><AlertTriangle size={15} /> Sua loja só recebe pedidos após conectar o Mercado Pago.</div>
              <button className={styles.mpConnectBtn} onClick={connectMp} disabled={connecting}>
                {connecting ? <><Loader2 size={17} className={styles.spin} /> Redirecionando…</> : <><ExternalLink size={17} /> Conectar Mercado Pago</>}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
