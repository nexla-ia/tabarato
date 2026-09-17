'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight, Clock, X, MapPin, CreditCard, TriangleAlert, MessageCircle, Printer,
  Inbox, ChefHat, ShoppingBag, Bike, CheckCircle2, Ban,
} from 'lucide-react'
import { api } from '@/lib/api'
import {
  Order, OrderStatus, STATUS_LABEL, STATUS_COLOR, NEXT_STATUS, NEXT_STATUS_LABEL,
  PAYMENT_LABEL, money, timeAgo, isOrderLate,
} from '@/lib/types'
import { Spinner } from '@/components/Spinner'
import styles from './page.module.css'

// Quadro operacional: 3 colunas com o que o lojista precisa FAZER, na ordem do fluxo.
// O histórico (entregues/cancelados) fica numa aba à parte pra não poluir o dia a dia.
const COLUMNS: { key: string; title: string; hint: string; color: string; icon: any; statuses: OrderStatus[] }[] = [
  { key: 'new',   title: 'Novos',      hint: 'Confirme e inicie o preparo', color: '#2563EB', icon: Inbox,      statuses: ['PENDING', 'CONFIRMED'] },
  { key: 'prep',  title: 'Preparando', hint: 'Em produção',                 color: '#7C3AED', icon: ChefHat,    statuses: ['PREPARING'] },
  { key: 'ready', title: 'Prontos',    hint: 'Aguardando o entregador',     color: '#0891B2', icon: ShoppingBag, statuses: ['READY', 'PICKED_UP'] },
]

export default function PedidosPage() {
  const qc = useQueryClient()
  const router = useRouter()
  const [view, setView] = useState<'active' | 'history'>('active')
  const [histFilter, setHistFilter] = useState<'ALL' | 'DELIVERED' | 'CANCELLED'>('ALL')
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
  const lateCount = orders.filter(isOrderLate).length
  const activeStatuses: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PICKED_UP']
  const activeCount = orders.filter(o => activeStatuses.includes(o.status)).length
  const histAll = orders.filter(o => o.status === 'DELIVERED' || o.status === 'CANCELLED')

  function ordersFor(statuses: OrderStatus[]) {
    return orders
      .filter(o => statuses.includes(o.status))
      .slice()
      .sort((a, b) => {
        // Atrasados primeiro; depois mais antigos no topo (FIFO — quem esperou mais).
        const la = Number(isOrderLate(a)), lb = Number(isOrderLate(b))
        if (la !== lb) return lb - la
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      })
  }

  const history = (histFilter === 'ALL' ? histAll : histAll.filter(o => o.status === histFilter))
    .slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  function printOrder(o: any) {
    const win = window.open('', '_blank', 'width=400,height=640')
    if (!win) return
    const esc = (s: any) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string))
    const items = (o.items ?? []).map((i: any) =>
      `<tr><td>${esc(i.quantity)}x ${esc(i.product?.name)}${i.variation?.name ? ' - ' + esc(i.variation.name) : ''}</td><td style="text-align:right">${money(i.unitPrice * i.quantity)}</td></tr>`).join('')
    const addr = o.address ? [o.address.street, o.address.number, o.address.district, o.address.city].filter(Boolean).map(esc).join(', ') : ''
    win.document.write(`<html><head><title>Pedido ${esc(o.id.slice(-6).toUpperCase())}</title>
      <style>body{font-family:monospace;padding:12px;font-size:13px}h2{margin:0 0 4px}table{width:100%;border-collapse:collapse}td{padding:2px 0}hr{border:0;border-top:1px dashed #000;margin:8px 0}.tot{font-weight:bold;font-size:15px}</style>
      </head><body>
      <h2>Tá Barato</h2>
      <div>Pedido #${esc(o.id.slice(-6).toUpperCase())}</div>
      <div>${esc(new Date(o.createdAt).toLocaleString('pt-BR'))}</div><hr/>
      <div><b>Cliente:</b> ${esc(o.user?.name)} ${esc(o.user?.phone ?? '')}</div>
      ${addr ? `<div><b>Entrega:</b> ${addr}</div>` : ''}<hr/>
      <table>${items}</table><hr/>
      <table>
        <tr><td>Subtotal</td><td style="text-align:right">${money(o.subtotal)}</td></tr>
        <tr><td>Entrega</td><td style="text-align:right">${money(o.deliveryFee)}</td></tr>
        ${Number(o.discount) > 0 ? `<tr><td>Desconto</td><td style="text-align:right">-${money(o.discount)}</td></tr>` : ''}
        <tr class="tot"><td>Total</td><td style="text-align:right">${money(o.total)}</td></tr>
      </table><hr/>
      <div>Pagamento: ${esc(PAYMENT_LABEL[o.payment?.method ?? ''] ?? o.payment?.method ?? '-')}</div>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`)
    win.document.close()
  }

  function Card({ o }: { o: Order }) {
    const next = NEXT_STATUS[o.status]
    const canCancel = ['PENDING', 'CONFIRMED', 'PREPARING'].includes(o.status)
    const late = isOrderLate(o)
    const itemCount = (o.items ?? []).reduce((s, i) => s + i.quantity, 0)
    const hasNotes = (o.items ?? []).some(i => i.notes)
    return (
      <div className={`${styles.card} ${late ? styles.cardLate : ''}`} style={!late ? { borderLeftColor: STATUS_COLOR[o.status] } : undefined}>
        <div className={styles.cardHead}>
          <div className={styles.headLeft}>
            <span className={styles.orderId}>#{o.id.slice(-6).toUpperCase()}</span>
            {late
              ? <span className={styles.lateBadge}><TriangleAlert size={11} /> Atrasado</span>
              : <span className={styles.badge} style={{ background: `${STATUS_COLOR[o.status]}18`, color: STATUS_COLOR[o.status] }}>{STATUS_LABEL[o.status]}</span>}
          </div>
          <span className={styles.time}><Clock size={12} /> {timeAgo(o.createdAt)}</span>
        </div>

        <div className={styles.client}>
          {o.user?.name ?? 'Cliente'}
          {o.user?.phone ? <span className={styles.phone}> · {o.user.phone}</span> : null}
        </div>

        {o.address && (
          <div className={styles.addr}>
            <MapPin size={13} />
            <span>{[o.address.street, o.address.number, o.address.district].filter(Boolean).join(', ')}{o.address.complement ? ` (${o.address.complement})` : ''}</span>
          </div>
        )}

        <div className={styles.items}>
          {(o.items ?? []).map(i => (
            <div key={i.id} className={styles.itemRow}>
              <span><b>{i.quantity}×</b> {i.product?.name ?? 'item'}{i.variation?.name ? ` — ${i.variation.name}` : ''}</span>
              <span>{money(Number(i.unitPrice) * i.quantity)}</span>
            </div>
          ))}
          {hasNotes && (
            <div className={styles.notes}>
              {(o.items ?? []).filter(i => i.notes).map(i => <div key={i.id}>“{i.notes}”</div>)}
            </div>
          )}
        </div>

        <div className={styles.totals}>
          <span className={styles.payment}><CreditCard size={13} /> {PAYMENT_LABEL[o.payment?.method ?? ''] ?? o.payment?.method ?? '—'} · {itemCount} {itemCount === 1 ? 'item' : 'itens'}</span>
          <div className={styles.totalBox}>
            <span className={styles.totalLabel}>Total</span>
            <span className={styles.total}>{money(o.total)}</span>
          </div>
        </div>

        {(o.status === 'READY' || o.status === 'PICKED_UP') && (
          <div className={styles.waitRow}>
            {o.status === 'READY'
              ? <><ShoppingBag size={13} /> Aguardando o entregador retirar</>
              : <><Bike size={13} /> Saiu para entrega</>}
          </div>
        )}

        <div className={styles.cardFoot}>
          <button className={styles.iconBtn} onClick={() => router.push(`/lojista/mensagens?pedido=${o.id}`)} title="Chat com o cliente"><MessageCircle size={15} /></button>
          <button className={styles.iconBtn} onClick={() => printOrder(o)} title="Imprimir comprovante"><Printer size={15} /></button>
          {canCancel && (
            <button className={styles.cancelBtn} onClick={() => { setCancelId(o.id); setNote('') }}>Recusar</button>
          )}
          {next && (
            <button className={styles.advanceBtn} onClick={() => advance.mutate({ id: o.id, status: next })} disabled={advance.isPending}>
              {NEXT_STATUS_LABEL[o.status]} <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className={styles.topBar}>
        <div>
          <h1 className={styles.title}>Pedidos</h1>
          <p className={styles.subtitle}>Acompanhe e avance seus pedidos por etapa</p>
        </div>
        <div className={styles.viewToggle}>
          <button className={`${styles.viewBtn} ${view === 'active' ? styles.viewBtnActive : ''}`} onClick={() => setView('active')}>
            Em andamento{activeCount > 0 && <span className={styles.viewCount}>{activeCount}</span>}
          </button>
          <button className={`${styles.viewBtn} ${view === 'history' ? styles.viewBtnActive : ''}`} onClick={() => setView('history')}>
            Histórico
          </button>
        </div>
      </div>

      {view === 'active' && lateCount > 0 && (
        <div className={styles.lateBanner}>
          <TriangleAlert size={16} />
          {lateCount} pedido{lateCount === 1 ? '' : 's'} aguardando confirmação há mais de 7 minutos — priorize os marcados em vermelho.
        </div>
      )}

      {ordersQ.isLoading ? (
        <Spinner />
      ) : view === 'active' ? (
        <div className={styles.board}>
          {COLUMNS.map(col => {
            const list = ordersFor(col.statuses)
            const Icon = col.icon
            return (
              <section key={col.key} className={styles.column}>
                <header className={styles.colHead} style={{ ['--col' as any]: col.color }}>
                  <span className={styles.colIcon}><Icon size={16} /></span>
                  <div className={styles.colTitleWrap}>
                    <span className={styles.colTitle}>{col.title}</span>
                    <span className={styles.colHint}>{col.hint}</span>
                  </div>
                  <span className={styles.colCount}>{list.length}</span>
                </header>
                <div className={styles.colBody}>
                  {list.length === 0
                    ? <div className={styles.colEmpty}>Nada aqui por enquanto</div>
                    : list.map(o => <Card key={o.id} o={o} />)}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <>
          <div className={styles.histFilters}>
            {([['ALL', 'Todos'], ['DELIVERED', 'Entregues'], ['CANCELLED', 'Cancelados']] as const).map(([k, label]) => (
              <button key={k} className={`${styles.chip} ${histFilter === k ? styles.chipActive : ''}`} onClick={() => setHistFilter(k)}>
                {label}<span className={styles.chipCount}>{k === 'ALL' ? histAll.length : histAll.filter(o => o.status === k).length}</span>
              </button>
            ))}
          </div>
          {history.length === 0 ? (
            <div className={styles.empty}>Nenhum pedido no histórico.</div>
          ) : (
            <div className={styles.histList}>
              {history.map(o => (
                <div key={o.id} className={styles.histRow}>
                  <span className={styles.histStatus} style={{ color: STATUS_COLOR[o.status] }}>
                    {o.status === 'DELIVERED' ? <CheckCircle2 size={16} /> : <Ban size={16} />}
                  </span>
                  <span className={styles.histId}>#{o.id.slice(-6).toUpperCase()}</span>
                  <span className={styles.histClient}>{o.user?.name ?? 'Cliente'}</span>
                  <span className={styles.histBadge} style={{ background: `${STATUS_COLOR[o.status]}14`, color: STATUS_COLOR[o.status] }}>{STATUS_LABEL[o.status]}</span>
                  <span className={styles.histTime}>{timeAgo(o.createdAt)}</span>
                  <span className={styles.histTotal}>{money(o.total)}</span>
                  <button className={styles.iconBtn} onClick={() => printOrder(o)} title="Imprimir"><Printer size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </>
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
              <button className={styles.modalConfirm} onClick={() => cancel.mutate({ id: cancelId, note })} disabled={cancel.isPending}>
                {cancel.isPending ? 'Recusando…' : 'Recusar pedido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
