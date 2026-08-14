'use client'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, CreditCard, ExternalLink, AlertTriangle, Loader2, Store as StoreIcon, Camera, Copy, Plus, X, Upload } from 'lucide-react'
import { api } from '@/lib/api'
import { Store, DaySchedule } from '@/lib/types'
import { formatPhone, onlyDigits } from '@/lib/masks'
import styles from './page.module.css'

interface MpStatus { enabled: boolean; connected: boolean; mpUserId: string | null }

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const DEFAULT_HOURS: DaySchedule[] = Array.from({ length: 7 }, () => ({ open: false, from: '08:00', to: '18:00' }))

export default function ConfigPage() {
  const qc = useQueryClient()
  const storeQ = useQuery<Store>({ queryKey: ['store-my'], queryFn: async () => (await api.get('/stores/my')).data })
  const mpQ = useQuery<MpStatus>({ queryKey: ['mp-status'], queryFn: async () => (await api.get('/stores/mp/status')).data })

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [phone, setPhone] = useState('')
  const [radius, setRadius] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoError, setLogoError] = useState('')
  const [hours, setHours] = useState<DaySchedule[]>(DEFAULT_HOURS)
  const [saved, setSaved] = useState(false)
  const [mpMsg, setMpMsg] = useState<'ok' | 'erro' | null>(null)
  const [connecting, setConnecting] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const [photos, setPhotos] = useState<string[]>([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [documentUrl, setDocumentUrl] = useState('')
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [docError, setDocError] = useState('')
  const docInputRef = useRef<HTMLInputElement>(null)

  const [maxConcurrentOrders, setMaxConcurrentOrders] = useState('')

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

  // O Mercado Pago abre em aba nova — ao voltar o foco pra essa aba,
  // reconsulta o status pra refletir se a conexão foi concluída lá.
  useEffect(() => {
    function onFocus() { qc.invalidateQueries({ queryKey: ['mp-status'] }) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [qc])

  async function connectMp() {
    setConnecting(true)
    // Reserva a aba nova já no clique (gesto do usuário), antes do await —
    // senão o navegador pode bloquear a abertura por não considerar o
    // redirect pós-fetch um popup confiável.
    const tab = window.open('', '_blank')
    try {
      const { data } = await api.get<{ url: string }>('/stores/mp/connect')
      if (tab) tab.location.href = data.url
      else window.open(data.url, '_blank')
      setConnecting(false)
    } catch {
      tab?.close()
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
    setPhone(formatPhone(s.phone ?? ''))
    setRadius(s.deliveryRadiusKm != null ? String(s.deliveryRadiusKm) : '')
    setLogoUrl(s.logoUrl ?? '')
    setHours(Array.isArray(s.openingHours) && s.openingHours.length === 7 ? s.openingHours : DEFAULT_HOURS)
    setPhotos(Array.isArray(s.photos) ? s.photos : [])
    setDocumentUrl(s.documentUrl ?? '')
    setMaxConcurrentOrders(s.maxConcurrentOrders != null ? String(s.maxConcurrentOrders) : '')
  }, [storeQ.data])

  async function handleLogoFile(file: File) {
    setLogoError('')
    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post<{ url: string }>('/uploads/image', formData)
      setLogoUrl(data.url)
    } catch {
      setLogoError('Não foi possível enviar a imagem. Use JPEG, PNG ou WEBP de até 10MB.')
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handlePhotoFile(file: File) {
    setPhotoError('')
    setUploadingPhoto(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post<{ url: string }>('/uploads/image', formData)
      setPhotos((prev) => [...prev, data.url])
    } catch {
      setPhotoError('Não foi possível enviar a foto. Use JPEG, PNG ou WEBP de até 10MB.')
    } finally {
      setUploadingPhoto(false)
    }
  }
  function removePhoto(url: string) {
    setPhotos((prev) => prev.filter((p) => p !== url))
  }

  async function handleDocFile(file: File) {
    setDocError('')
    setUploadingDoc(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post<{ url: string }>('/uploads/image', formData)
      setDocumentUrl(data.url)
    } catch {
      setDocError('Não foi possível enviar o documento. Use JPEG, PNG, WEBP ou PDF de até 10MB.')
    } finally {
      setUploadingDoc(false)
    }
  }

  function updateDay(index: number, patch: Partial<DaySchedule>) {
    setHours((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }
  function applyToAllDays(index: number) {
    const { from, to } = hours[index]
    setHours((prev) => prev.map((d) => ({ ...d, from, to })))
  }

  const save = useMutation({
    mutationFn: async () => (await api.patch('/stores/my', {
      name,
      description: description || undefined,
      phone: onlyDigits(phone) || undefined,
      deliveryRadiusKm: radius === '' ? undefined : Number(radius),
      logoUrl: logoUrl || undefined,
      openingHours: hours,
      photos,
      documentUrl: documentUrl || undefined,
      maxConcurrentOrders: maxConcurrentOrders === '' ? null : Number(maxConcurrentOrders),
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
        <label className={styles.label} style={{ marginTop: 0 }}>Foto da loja</label>
        <div className={styles.logoRow}>
          <div className={styles.logoPreview}>
            {logoUrl ? <img src={logoUrl} alt="Logo da loja" /> : <StoreIcon size={26} strokeWidth={1.5} />}
          </div>
          <div>
            <input
              ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); e.target.value = '' }}
            />
            <button type="button" className={styles.logoBtn} onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
              {uploadingLogo ? <><Loader2 size={15} className={styles.spin} /> Enviando…</> : <><Camera size={15} /> {logoUrl ? 'Trocar foto' : 'Enviar foto'}</>}
            </button>
            <p className={styles.hint}>JPEG, PNG ou WEBP, até 10MB.</p>
            {logoError && <p className={styles.logoErr}>{logoError}</p>}
          </div>
        </div>

        <label className={styles.label}>Nome da loja</label>
        <input className={styles.input} value={name} onChange={e => setName(e.target.value)} />

        <label className={styles.label}>Descrição</label>
        <textarea className={styles.input} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Conte sobre sua loja…" />

        <label className={styles.label}>Telefone / WhatsApp</label>
        <input className={styles.input} value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="(69) 99999-9999" />

        <label className={styles.label}>Raio de entrega (km)</label>
        <input className={styles.input} type="number" step="0.5" value={radius} onChange={e => setRadius(e.target.value)} placeholder="Ex.: 8" />
        <p className={styles.hint}>Clientes fora desse raio não verão sua loja.</p>

        <button className={styles.saveBtn} onClick={() => save.mutate()} disabled={save.isPending || !name}>
          {saved ? <><Check size={17} /> Salvo!</> : save.isPending ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>

      {/* Horário de funcionamento — abre/fecha sozinha, sem precisar clicar todo dia */}
      <div className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.mpHead}>
          <span className={styles.mpIcon} style={{ background: '#FFF0EB', color: 'var(--orange)' }}><StoreIcon size={20} /></span>
          <div>
            <div className={styles.mpTitle}>Horário de funcionamento</div>
            <div className={styles.mpSub}>Defina os dias e horários — sua loja abre e fecha sozinha, sem precisar clicar todo dia.</div>
          </div>
        </div>

        <div className={styles.hoursList}>
          {hours.map((day, i) => (
            <div key={i} className={styles.dayRow}>
              <label className={styles.dayToggle}>
                <input type="checkbox" checked={day.open} onChange={(e) => updateDay(i, { open: e.target.checked })} />
                <span className={styles.dayName}>{DAY_LABELS[i]}</span>
              </label>
              {day.open ? (
                <div className={styles.dayTimes}>
                  <input type="time" className={styles.timeInput} value={day.from} onChange={(e) => updateDay(i, { from: e.target.value })} />
                  <span className={styles.dayDash}>às</span>
                  <input type="time" className={styles.timeInput} value={day.to} onChange={(e) => updateDay(i, { to: e.target.value })} />
                  <button type="button" className={styles.copyBtn} onClick={() => applyToAllDays(i)} title="Usar esse horário todos os dias">
                    <Copy size={13} /> Aplicar a todos
                  </button>
                </div>
              ) : (
                <span className={styles.dayClosed}>Fechado</span>
              )}
            </div>
          ))}
        </div>
        <p className={styles.hint}>Fora desses horários sua loja aparece como fechada automaticamente. Você ainda pode pausar manualmente a qualquer momento no Painel.</p>

        <button className={styles.saveBtn} onClick={() => save.mutate()} disabled={save.isPending || !name}>
          {saved ? <><Check size={17} /> Salvo!</> : save.isPending ? 'Salvando…' : 'Salvar alterações'}
        </button>
      </div>

      {/* Mais configurações — galeria, documento da empresa, limite de pedidos */}
      <div className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.mpHead}>
          <span className={styles.mpIcon} style={{ background: '#FFF0EB', color: 'var(--orange)' }}><StoreIcon size={20} /></span>
          <div>
            <div className={styles.mpTitle}>Mais configurações</div>
            <div className={styles.mpSub}>Fotos da loja, documento da empresa e limite de pedidos.</div>
          </div>
        </div>

        <label className={styles.label} style={{ marginTop: 0 }}>Fotos da loja</label>
        <div className={styles.photoGrid}>
          {photos.map((url) => (
            <div key={url} className={styles.photoThumb}>
              <img src={url} alt="Foto da loja" />
              <button type="button" className={styles.photoRemove} onClick={() => removePhoto(url)} title="Remover"><X size={12} /></button>
            </div>
          ))}
          <input
            ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f); e.target.value = '' }}
          />
          <button type="button" className={styles.photoAdd} onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto || photos.length >= 20}>
            {uploadingPhoto ? <Loader2 size={16} className={styles.spin} /> : <Plus size={16} />}
            {uploadingPhoto ? 'Enviando' : 'Adicionar'}
          </button>
        </div>
        <p className={styles.hint}>Aparecem na galeria da sua loja pros clientes. Até 20 fotos.</p>
        {photoError && <p className={styles.logoErr}>{photoError}</p>}

        <label className={styles.label}>Documento da empresa</label>
        <div className={styles.docRow}>
          {documentUrl ? (
            <span className={styles.docStatus}><Check size={15} /> Documento enviado — <a href={documentUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--orange)' }}>ver arquivo</a></span>
          ) : (
            <span className={styles.docMissing}>Nenhum documento enviado</span>
          )}
        </div>
        <input
          ref={docInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocFile(f); e.target.value = '' }}
        />
        <button type="button" className={styles.logoBtn} style={{ marginTop: 10 }} onClick={() => docInputRef.current?.click()} disabled={uploadingDoc}>
          {uploadingDoc ? <><Loader2 size={15} className={styles.spin} /> Enviando…</> : <><Upload size={15} /> {documentUrl ? 'Trocar documento' : 'Enviar documento'}</>}
        </button>
        <p className={styles.hint}>Cartão CNPJ ou CCMEI — JPEG, PNG, WEBP ou PDF, até 10MB.</p>
        {docError && <p className={styles.logoErr}>{docError}</p>}

        <label className={styles.label}>Limite de pedidos simultâneos</label>
        <input
          className={styles.input} type="number" min={0}
          value={maxConcurrentOrders}
          onChange={(e) => setMaxConcurrentOrders(e.target.value)}
          placeholder="vazio = ilimitado"
        />
        <p className={styles.hint}>Novos pedidos ficam bloqueados ao atingir esse limite. Deixe em branco pra não limitar.</p>

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
