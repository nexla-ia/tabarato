'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Power, Pause, Play, ArrowRight, Clock, Hourglass, XCircle, Ban } from 'lucide-react'
import { api } from '@/lib/api'
import { Store, Order, STATUS_LABEL, STATUS_COLOR, NEXT_STATUS, NEXT_STATUS_LABEL, money, timeAgo } from '@/lib/types'
import { Spinner } from '@/components/Spinner'
import styles from './page.module.css'

function startOfToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d
}

export default function LojistaDashboard() {
  const qc = useQueryClient()

  const storeQ = useQuery<Store>({
    queryKey: ['store-my'],
    queryFn: async () => (await api.get('/stores/my')).data,
  })

  const ordersQ = useQuery<Order[]>({
    queryKey: ['store-orders'],
    queryFn: async () => (await api.get('/orders/store')).data,
    refetchInterval: 20_000,
  })

  // Antes: clicar esperava o PATCH voltar e SÓ DEPOIS disparava um invalidate
  // (mais um GET do zero) pra atualizar a tela — 2 viagens de rede em série
  // pra virar um botão, e nada mexia na tela até as duas voltarem. A resposta
  // do PATCH já vem com {isOpen, isPaused} corretos (o back computa isso
  // considerando o horário de funcionamento), então: onMutate vira o botão na
  // hora (otimista, sem esperar rede) e onSuccess grava a resposta real no
  // cache direto — sem refetch nenhum. Erro reverte pro estado anterior.
  const toggleOpen = useMutation({
    mutationFn: async () => (await api.patch('/stores/my/toggle-open')).data,
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['store-my'] })
      const prev = qc.getQueryData<Store>(['store-my'])
      if (prev) qc.setQueryData<Store>(['store-my'], { ...prev, isOpen: !prev.isOpen, isPaused: prev.isOpen })
      return { prev }
    },
    onError: (_err, _vars, ctx) => { if (ctx?.prev) qc.setQueryData(['store-my'], ctx.prev) },
    onSuccess: (data) => qc.setQueryData<Store>(['store-my'], (old) => old ? { ...old, ...data } : old),
  })
  const togglePause = useMutation({
    mutationFn: async () => (await api.patch('/stores/my/toggle-pause')).data,
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['store-my'] })
      const prev = qc.getQueryData<Store>(['store-my'])
      if (prev) qc.setQueryData<Store>(['store-my'], { ...prev, isPaused: !prev.isPaused, isOpen: !!prev.isPaused })
      return { prev }
    },
    onError: (_err, _vars, ctx) => { if (ctx?.prev) qc.setQueryData(['store-my'], ctx.prev) },
    onSuccess: (data) => qc.setQueryData<Store>(['store-my'], (old) => old ? { ...old, ...data } : old),
  })
  // Mesmo tratamento de /lojista/pedidos (essa é a versão simplificada do
  // widget "pedidos ativos" do painel) — vira o status na hora do clique.
  const advance = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await api.patch(`/orders/${id}/status`, { status })).data,
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['store-orders'] })
      const prev = qc.getQueryData<Order[]>(['store-orders'])
      qc.setQueryData<Order[]>(['store-orders'], (old) =>
        old?.map((o) => (o.id === id ? { ...o, status: status as Order['status'] } : o)))
      return { prev }
    },
    onError: (_err, _vars, ctx) => { if (ctx?.prev) qc.setQueryData(['store-orders'], ctx.prev) },
    onSettled: () => qc.invalidateQueries({ queryKey: ['store-orders'] }),
  })

  const store = storeQ.data
  const orders = ordersQ.data ?? []

  const today = startOfToday()
  const todayOrders = orders.filter(o => new Date(o.createdAt) >= today && o.status !== 'CANCELLED')
  const revenue = todayOrders.reduce((s, o) => s + Number(o.total ?? 0), 0)
  const pending = orders.filter(o => o.status === 'PENDING').length
  const active = orders.filter(o => ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'].includes(o.status))

  return (
    <div>
      {store && store.status !== 'APPROVED' && (
        <div className={`${styles.statusBanner} ${styles[`statusBanner${store.status}`]}`}>
          {store.status === 'PENDING' && (
            <>
              <Hourglass size={18} />
              <div><strong>Loja em análise.</strong> Assim que nosso time aprovar, ela aparece no app e você começa a receber pedidos.</div>
            </>
          )}
          {store.status === 'REJECTED' && (
            <>
              <XCircle size={18} />
              <div><strong>Cadastro rejeitado.</strong> Confira os dados da sua loja em Configurações ou fale com o suporte pra entender o motivo.</div>
            </>
          )}
          {store.status === 'SUSPENDED' && (
            <>
              <Ban size={18} />
              <div><strong>Loja suspensa.</strong> Sua loja está temporariamente indisponível no app. Fale com o suporte pra mais detalhes.</div>
            </>
          )}
        </div>
      )}

      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>{store?.name ?? 'Minha loja'}</h1>
          <p className={styles.subtitle}>Painel do lojista</p>
        </div>
        {store && (
          <div className={styles.storeActions}>
            <button
              className={`${styles.stateBtn} ${store.isOpen ? styles.stateOn : styles.stateOff}`}
              onClick={() => toggleOpen.mutate()}
              disabled={toggleOpen.isPending}
            >
              <Power size={16} />
              {store.isOpen ? 'Loja aberta' : 'Loja fechada'}
            </button>
            {store.isOpen && (
              <button
                className={`${styles.stateBtn} ${store.isPaused ? styles.statePaused : styles.stateNeutral}`}
                onClick={() => togglePause.mutate()}
                disabled={togglePause.isPending}
              >
                {store.isPaused ? <Play size={16} /> : <Pause size={16} />}
                {store.isPaused ? 'Retomar pedidos' : 'Pausar pedidos'}
              </button>
            )}
          </div>
        )}
      </div>

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Pedidos hoje</div>
          <div className={styles.statValue}>{todayOrders.length}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Faturamento hoje</div>
          <div className={styles.statValue}>{money(revenue)}</div>
        </div>
        <div className={styles.statCard} style={{ borderColor: pending > 0 ? '#F59E0B' : undefined }}>
          <div className={styles.statLabel}>Aguardando</div>
          <div className={styles.statValue} style={{ color: pending > 0 ? '#D97706' : undefined }}>{pending}</div>
        </div>
      </div>

      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Pedidos ativos</h2>
        <Link href="/lojista/pedidos" className={styles.seeAll}>Ver todos →</Link>
      </div>

      {ordersQ.isLoading ? (
        <Spinner label="Carregando pedidos…" />
      ) : active.length === 0 ? (
        <div className={styles.empty}>Nenhum pedido ativo no momento.</div>
      ) : (
        <div className={styles.orderList}>
          {active.map(o => {
            const next = NEXT_STATUS[o.status]
            return (
              <div key={o.id} className={styles.orderCard}>
                <div className={styles.orderMain}>
                  <div className={styles.orderTop}>
                    <span className={styles.orderId}>#{o.id.slice(-6).toUpperCase()}</span>
                    <span className={styles.badge} style={{ background: `${STATUS_COLOR[o.status]}18`, color: STATUS_COLOR[o.status] }}>
                      {STATUS_LABEL[o.status]}
                    </span>
                    {o.scheduledFor && (
                      <span className={styles.schedule}><Clock size={12} /> {new Date(o.scheduledFor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                  </div>
                  <div className={styles.orderClient}>{o.user?.name ?? 'Cliente'}</div>
                  <div className={styles.orderItems}>
                    {(o.items ?? []).map(i => `${i.quantity}x ${i.product?.name ?? 'item'}`).join(', ') || '—'}
                  </div>
                  <div className={styles.orderMeta}>
                    <span className={styles.orderTotal}>{money(o.total)}</span>
                    <span className={styles.orderTime}><Clock size={11} /> {timeAgo(o.createdAt)}</span>
                  </div>
                </div>
                {next && (
                  <button
                    className={styles.advanceBtn}
                    onClick={() => advance.mutate({ id: o.id, status: next })}
                    disabled={advance.isPending}
                  >
                    {NEXT_STATUS_LABEL[o.status]} <ArrowRight size={15} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
