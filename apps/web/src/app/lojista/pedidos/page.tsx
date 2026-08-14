'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Clock, X, MapPin, CreditCard } from 'lucide-react'
import { api } from '@/lib/api'
import {
  Order, OrderStatus, STATUS_LABEL, STATUS_COLOR, NEXT_STATUS, NEXT_STATUS_LABEL,
  PAYMENT_LABEL, money, timeAgo,
} from '@/lib/types'
import { Spinner } from '@/components/Spinner'
import styles from './page.module.css'

const FILTERS: { key: OrderStatus | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'Todos' },
  { key: 'PENDING', label: 'Aguardando' },
  { key: 'CONFIRMED', label: 'Confirmado' },
  { key: 'PREPARING', label: 'Preparando' },
  { key: 'READY', label: 'Pronto' },
  { key: 'DELIVERED', label: 'Entregue' },
  { key: 'CANCELLED', label: 'Cancelado' },
]

export default function PedidosPage() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<OrderStatus | 'ALL'>('ALL')
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const ordersQ = useQuery<Order[]>({
    queryKey: ['store-orders'],
    queryFn: async () => (await api.get('/orders/store')).data,
    refetchInterval: 20_000,
  })

  const advance = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await api.patch(`/orders/${id}/status`, { status })).data,
    // Atualiza a tela na hora do clique — não espera o round-trip do servidor.
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['store-orders'] })
      const prev = qc.getQueryData<Order[]>(['store-orders'])
      qc.setQueryData<Order[]>(['store-orders'], (old) =>
        old?.map((o) => (o.id === id ? { ...o, status: status as OrderStatus } : o)))
      return { prev }
    },
    onError: (_err, _vars, ctx) => { if (ctx?.prev) qc.setQueryData(['store-orders'], ctx.prev) },
    onSettled: () => qc.invalidateQueries({ queryKey: ['store-orders'] }),
  })
  const cancel = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) =>
      (await api.patch(`/orders/${id}/cancel-store`, { note: note || undefined })).data,
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: ['store-orders'] })
      const prev = qc.getQueryData<Order[]>(['store-orders'])
      qc.setQueryData<Order[]>(['store-orders'], (old) =>
        old?.map((o) => (o.id === id ? { ...o, status: 'CANCELLED' as OrderStatus } : o)))
      return { prev }
    },
    onError: (_err, _vars, ctx) => { if (ctx?.prev) qc.setQueryData(['store-orders'], ctx.prev) },
    onSuccess: () => { setCancelId(null); setNote('') },
    onSettled: () => qc.invalidateQueries({ queryKey: ['store-orders'] }),
  })

  const orders = ordersQ.data ?? []
  const filtered = filter === 'ALL' ? orders : orders.filter(o => o.status === filter)

  return (
    <div>
      <h1 className={styles.title}>Pedidos</h1>
      <p className={styles.subtitle}>Gerencie e acompanhe seus pedidos</p>

      <div className={styles.filters}>
        {FILTERS.map(f => {
          const count = f.key === 'ALL' ? orders.length : orders.filter(o => o.status === f.key).length
          return (
            <button
              key={f.key}
              className={`${styles.chip} ${filter === f.key ? styles.chipActive : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}{count > 0 && <span className={styles.chipCount}>{count}</span>}
            </button>
          )
        })}
      </div>

      {ordersQ.isLoading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>Nenhum pedido {filter !== 'ALL' ? `em "${STATUS_LABEL[filter]}"` : ''}.</div>
      ) : (
        <div className={styles.list}>
          {filtered.map(o => {
            const next = NEXT_STATUS[o.status]
            const canCancel = ['PENDING', 'CONFIRMED', 'PREPARING'].includes(o.status)
            return (
              <div key={o.id} className={styles.card}>
                <div className={styles.cardHead}>
                  <div className={styles.headLeft}>
                    <span className={styles.orderId}>#{o.id.slice(-6).toUpperCase()}</span>
                    <span className={styles.badge} style={{ background: `${STATUS_COLOR[o.status]}18`, color: STATUS_COLOR[o.status] }}>
                      {STATUS_LABEL[o.status]}
                    </span>
                  </div>
                  <span className={styles.time}><Clock size={12} /> {timeAgo(o.createdAt)}</span>
                </div>

                <div className={styles.client}>{o.user?.name ?? 'Cliente'}{o.user?.phone ? ` · ${o.user.phone}` : ''}</div>

                {o.address && (
                  <div className={styles.addr}>
                    <MapPin size={13} />
                    {[o.address.street, o.address.number, o.address.district, o.address.city].filter(Boolean).join(', ')}
                    {o.address.complement ? ` (${o.address.complement})` : ''}
                  </div>
                )}

                <div className={styles.items}>
                  {(o.items ?? []).map(i => (
                    <div key={i.id} className={styles.itemRow}>
                      <span>{i.quantity}x {i.product?.name ?? 'item'}{i.variation?.name ? ` — ${i.variation.name}` : ''}</span>
                      <span>{money(Number(i.unitPrice) * i.quantity)}</span>
                    </div>
                  ))}
                  {(o.items ?? []).some(i => i.notes) && (
                    <div className={styles.notes}>
                      {(o.items ?? []).filter(i => i.notes).map(i => (
                        <div key={i.id}>“{i.notes}”</div>
                      ))}
                    </div>
                  )}
                </div>

                <div className={styles.totals}>
                  <span className={styles.payment}><CreditCard size={13} /> {PAYMENT_LABEL[o.payment?.method ?? ''] ?? o.payment?.method ?? '—'}</span>
                  <div className={styles.totalBox}>
                    <span className={styles.totalLabel}>Total</span>
                    <span className={styles.total}>{money(o.total)}</span>
                  </div>
                </div>

                {(next || canCancel) && (
                  <div className={styles.actions}>
                    {canCancel && (
                      <button className={styles.cancelBtn} onClick={() => { setCancelId(o.id); setNote('') }}>
                        Recusar
                      </button>
                    )}
                    {next && (
                      <button className={styles.advanceBtn} onClick={() => advance.mutate({ id: o.id, status: next })} disabled={advance.isPending}>
                        {NEXT_STATUS_LABEL[o.status]} <ArrowRight size={15} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {cancelId && (
        <div className={styles.overlay} onClick={() => setCancelId(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3>Recusar pedido</h3>
              <button onClick={() => setCancelId(null)}><X size={18} /></button>
            </div>
            <p className={styles.modalSub}>Informe o motivo (será enviado ao cliente).</p>
            <textarea
              className={styles.textarea}
              placeholder="Ex.: produto em falta, fora do horário…"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
            />
            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setCancelId(null)}>Voltar</button>
              <button
                className={styles.modalConfirm}
                onClick={() => cancel.mutate({ id: cancelId, note })}
                disabled={cancel.isPending}
              >
                {cancel.isPending ? 'Recusando…' : 'Recusar pedido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
