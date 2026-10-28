'use client'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Megaphone, QrCode, Copy, RefreshCw, X, Check, Loader2, CalendarDays } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { LoadError } from '@/components/LoadError'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { MyAd, brl, ctr, dataCurta, faseDoAnuncio } from '@/lib/ads'
import styles from './meus-anuncios.module.css'

function MeusAnuncios() {
  const router = useRouter()
  const params = useSearchParams()
  const { user, ready } = useAuth()
  const [ads, setAds] = useState<MyAd[] | null>(null)
  const [erro, setErro] = useState(false)
  const [pagando, setPagando] = useState<MyAd | null>(null)
  const [aviso, setAviso] = useState(params.get('enviado') ? 'Recebemos seu anúncio! Avisamos assim que for aprovado.' : '')

  const carregar = useCallback(() => {
    setErro(false)
    return api.get<MyAd[]>('/ads/mine').then((r) => setAds(r.data)).catch(() => setErro(true))
  }, [])

  useEffect(() => {
    if (!ready) return
    if (!user) { router.push('/login?redirect=/meus-anuncios'); return }
    carregar()
  }, [ready, user, router, carregar])

  async function cancelar(ad: MyAd) {
    if (!window.confirm('Cancelar este pedido de anúncio? Nada foi cobrado.')) return
    try {
      await api.post(`/ads/mine/${ad.id}/cancel`)
      setAviso('Pedido cancelado.')
      carregar()
    } catch (e: any) {
      setAviso(e?.response?.data?.message ?? 'Não foi possível cancelar.')
    }
  }

  if (!ready || !user) return <div className={styles.carregando}>Carregando…</div>

  return (
    <div className={`container ${styles.pagina}`}>
      <div className={styles.topo}>
        <h1 className={styles.titulo}>Meus anúncios</h1>
        <Link href="/anunciar" className={styles.cta}>Novo anúncio</Link>
      </div>
      {aviso && (
        <div className={styles.aviso} role="status">
          {aviso}
          <button type="button" onClick={() => setAviso('')} aria-label="Fechar aviso"><X size={15} /></button>
        </div>
      )}

      {erro ? (
        <LoadError onRetry={carregar} sub="Não conseguimos buscar seus anúncios. Verifique a conexão." />
      ) : !ads ? (
        <div className={styles.carregando}>Carregando…</div>
      ) : ads.length === 0 ? (
        <div className={styles.vazio}>
          <span className={styles.vazioIcone}><Megaphone size={28} /></span>
          <strong>Nenhum anúncio ainda</strong>
          <p>Coloque sua empresa no topo da tela inicial do Tá Barato. Você só paga depois que aprovarmos a arte.</p>
          <Link href="/anunciar" className={styles.cta}>Criar meu anúncio</Link>
        </div>
      ) : (
        <div className={styles.lista}>
          {ads.map((ad) => {
            const fase = faseDoAnuncio(ad)
            const terminou = ad.status === 'PAID' && !ad.live && !!ad.endsAt && new Date(ad.endsAt) <= new Date()
            const temMetricas = ad.status === 'PAID' && (ad.live || terminou)
            const podeRepetir = ad.status === 'REJECTED' || ad.status === 'EXPIRED_UNPAID' || terminou || ad.live
            return (
              <article key={ad.id} className={styles.cartao}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ad.imageUrl} alt={`Arte de ${ad.companyName}`} className={styles.arte} />
                <div className={styles.corpo}>
                  <div className={styles.linhaTopo}>
                    <span className={styles.pilula} style={{ background: fase.fundo, color: fase.cor }}>{fase.label}</span>
                    <span className={styles.valor}>{brl(ad.totalPrice)} · {ad.days} dias</span>
                  </div>

                  <p className={styles.texto}>
                    {ad.status === 'PENDING_REVIEW' && 'A equipe está conferindo a arte. Avisamos por e-mail e no app quando aprovar.'}
                    {ad.status === 'AWAITING_PAYMENT' && <>Pague até <strong>{ad.payDeadline ? dataCurta(ad.payDeadline) : '—'}</strong>. Depois do PIX, o anúncio entra no ar sozinho.</>}
                    {ad.status === 'REJECTED' && <><strong>Motivo:</strong> {ad.rejectReason ?? '—'}. Nada foi cobrado.</>}
                    {ad.status === 'EXPIRED_UNPAID' && 'O prazo para pagar acabou e o pedido foi encerrado. Nada foi cobrado.'}
                    {ad.status === 'CANCELLED' && 'Pedido cancelado.'}
                    {ad.status === 'PAID' && ad.startsAt && ad.endsAt && (
                      ad.live ? <>No ar até <strong>{dataCurta(ad.endsAt)}</strong>.</>
                        : terminou ? <>Ficou no ar de <strong>{dataCurta(ad.startsAt)} a {dataCurta(ad.endsAt)}</strong>.</>
                          : <>Entra no ar em <strong>{dataCurta(ad.startsAt)}</strong> e fica até {dataCurta(ad.endsAt)}.</>
                    )}
                  </p>

                  {temMetricas && (
                    <dl className={styles.metricas}>
                      <div><dt>exibições</dt><dd>{ad.impressions.toLocaleString('pt-BR')}</dd></div>
                      <div><dt>cliques</dt><dd>{ad.clicks.toLocaleString('pt-BR')}</dd></div>
                      <div><dt>taxa de clique</dt><dd>{ctr(ad)}%</dd></div>
                    </dl>
                  )}

                  <div className={styles.acoes}>
                    {ad.status === 'AWAITING_PAYMENT' && (
                      <button type="button" className={styles.cta} onClick={() => setPagando(ad)}>
                        <QrCode size={16} /> Pagar com PIX
                      </button>
                    )}
                    {(ad.status === 'PENDING_REVIEW' || ad.status === 'AWAITING_PAYMENT') && (
                      <button type="button" className={styles.sec} onClick={() => cancelar(ad)}>Cancelar</button>
                    )}
                    {podeRepetir && (
                      <Link href={`/anunciar?de=${ad.id}`} className={styles.sec}>
                        <RefreshCw size={14} /> {ad.status === 'REJECTED' ? 'Enviar nova arte' : ad.live ? 'Renovar' : 'Anunciar de novo'}
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {pagando && <PagamentoPix ad={pagando} onFechar={() => { setPagando(null); carregar() }} />}
    </div>
  )
}

function PagamentoPix({ ad, onFechar }: { ad: MyAd; onFechar: () => void }) {
  const [dados, setDados] = useState<MyAd | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pago, setPago] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const vivo = useRef(true)

  const gerar = useCallback(() => {
    setErro(null); setDados(null)
    api.post<MyAd>(`/ads/mine/${ad.id}/pay`)
      .then((r) => { if (r.data.status === 'PAID') setPago(true); setDados(r.data) })
      .catch((e) => setErro(e?.response?.data?.message ?? 'Não foi possível gerar o PIX agora.'))
  }, [ad.id])

  useEffect(() => {
    vivo.current = true
    gerar()
    return () => { vivo.current = false }
  }, [gerar])

  // Confere a cada 5 s: o GET consulta o provedor se o webhook atrasar.
  useEffect(() => {
    if (!dados || pago) return
    const t = setInterval(() => {
      api.get<MyAd>(`/ads/mine/${ad.id}`).then((r) => {
        if (vivo.current && r.data.status === 'PAID') { setPago(true); setDados(r.data) }
      }).catch(() => {})
    }, 5000)
    return () => clearInterval(t)
  }, [dados, pago, ad.id])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])

  async function copiar() {
    if (!dados?.pix?.code) return
    await navigator.clipboard?.writeText(dados.pix.code).catch(() => {})
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const previsto = dados?.projectedStartsAt
  const entraAgora = previsto ? new Date(previsto).getTime() - Date.now() < 60 * 60 * 1000 : true

  return (
    <div className={styles.fundoModal} onClick={(e) => { if (e.target === e.currentTarget) onFechar() }} role="dialog" aria-modal="true" aria-labelledby="pix-titulo">
      <div className={styles.modal}>
        <div className={styles.modalTopo}>
          <h2 id="pix-titulo">{pago ? 'Pagamento confirmado' : 'Pagar anúncio'}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar"><X size={20} /></button>
        </div>

        {pago && dados ? (
          <div className={styles.pago}>
            <span className={styles.pagoIcone}><Check size={30} /></span>
            <strong>{dados.live ? 'Seu anúncio está no ar!' : 'Anúncio agendado'}</strong>
            <p>
              {dados.live && dados.endsAt ? `Ele já aparece na tela inicial e fica até ${dataCurta(dados.endsAt)}.`
                : dados.startsAt && dados.endsAt ? `Ele entra no ar em ${dataCurta(dados.startsAt)} e fica até ${dataCurta(dados.endsAt)}.`
                  : 'Já registramos o pagamento.'}
            </p>
            <button type="button" className={styles.cta} onClick={onFechar}>Ver meus anúncios</button>
          </div>
        ) : erro ? (
          <div className={styles.pago}>
            <p>{erro}</p>
            <button type="button" className={styles.cta} onClick={gerar}>Tentar de novo</button>
          </div>
        ) : !dados?.pix ? (
          <div className={styles.carregando}><Loader2 size={24} className={styles.gira} /></div>
        ) : (
          <div className={styles.pix}>
            <strong className={styles.pixValor}>{brl(dados.totalPrice)}</strong>
            <span className={styles.pixSub}>{dados.days} dias na vitrine</span>
            {dados.pix.qrBase64 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`data:image/png;base64,${dados.pix.qrBase64}`} alt="QR Code do PIX" className={styles.qr} />
            )}
            <button type="button" className={styles.copiar} onClick={copiar}>
              {copiado ? <><Check size={16} /> Código copiado</> : <><Copy size={16} /> Copiar código PIX</>}
            </button>
            <p className={styles.pixValidade}>
              Código válido até {new Date(dados.pix.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
              Venceu? Feche e clique em pagar de novo.
            </p>
            {previsto && (
              <p className={styles.previsao}>
                <CalendarDays size={16} />
                {entraAgora ? 'Pagando agora, o anúncio entra no ar na hora.' : `A vitrine está cheia: pagando agora, entra em ${dataCurta(previsto)}.`}
              </p>
            )}
            <p className={styles.aguardando}><Loader2 size={15} className={styles.gira} /> Aguardando o pagamento…</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function MeusAnunciosPage() {
  return (
    <>
      <Navbar />
      <Suspense fallback={null}>
        <MeusAnuncios />
      </Suspense>
    </>
  )
}
