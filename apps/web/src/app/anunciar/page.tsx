'use client'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ImagePlus, Store, MessageCircle, Globe, Eye, Clock, QrCode, Rocket, Minus, Plus, Loader2, RefreshCw } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { LoadError } from '@/components/LoadError'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { formatPhone } from '@/lib/masks'
import { AdConfig, AdLinkType, MyAd, brl, dataCurta } from '@/lib/ads'
import styles from './anunciar.module.css'

function mascaraDocumento(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}

/** Lê largura/altura no navegador para a prévia mostrar o enquadramento certo. */
function medir(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => { resolve(img.naturalWidth / img.naturalHeight || 3); URL.revokeObjectURL(url) }
    img.onerror = () => { resolve(3); URL.revokeObjectURL(url) }
    img.src = url
  })
}

function Anunciar() {
  const router = useRouter()
  const params = useSearchParams()
  const de = params.get('de')
  const { user, ready } = useAuth()
  const temLoja = user?.role === 'STORE_OWNER'
  const inputArte = useRef<HTMLInputElement>(null)

  const [config, setConfig] = useState<AdConfig | null>(null)
  const [erroConfig, setErroConfig] = useState(false)
  const [arte, setArte] = useState<{ url: string; proporcao: number } | null>(null)
  const [enviandoArte, setEnviandoArte] = useState(false)
  const [erroArte, setErroArte] = useState('')
  const [dias, setDias] = useState(7)
  const [destino, setDestino] = useState<AdLinkType>('WHATSAPP')
  const [alvo, setAlvo] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [documento, setDocumento] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState('')

  function carregar() {
    setErroConfig(false)
    api.get<AdConfig>('/ads/config')
      .then((r) => { setConfig(r.data); setDias((d) => Math.max(d, r.data.minDays)) })
      .catch(() => setErroConfig(true))
  }
  useEffect(() => { carregar() }, [])

  useEffect(() => { if (temLoja) setDestino('STORE') }, [temLoja])

  useEffect(() => {
    if (ready && !user) router.push(`/login?redirect=${encodeURIComponent(de ? `/anunciar?de=${de}` : '/anunciar')}`)
  }, [ready, user, router, de])

  // "Anunciar de novo": reaproveita arte, destino e dados do anúncio anterior.
  useEffect(() => {
    if (!de || !user) return
    api.get<MyAd>(`/ads/mine/${de}`).then(({ data: a }) => {
      setArte({ url: a.imageUrl, proporcao: 3 })
      setEmpresa(a.companyName)
      setDocumento(mascaraDocumento(a.document))
      setDias(a.days)
      setDestino(a.linkType === 'STORE' && !temLoja ? 'NONE' : a.linkType)
      setAlvo(a.linkType === 'WHATSAPP' && a.linkTarget ? formatPhone(a.linkTarget.replace(/^55/, '')) : a.linkTarget ?? '')
    }).catch(() => {})
  }, [de, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function aoEscolher(file?: File) {
    if (!file) return
    setErroArte('')
    setEnviandoArte(true)
    try {
      const proporcao = await medir(file)
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post<{ url: string }>('/uploads/image', fd)
      setArte({ url: data.url, proporcao })
    } catch (e: any) {
      setErroArte(e?.response?.data?.message ?? 'Não foi possível enviar a arte.')
    } finally {
      setEnviandoArte(false)
      if (inputArte.current) inputArte.current.value = ''
    }
  }

  const total = config ? Math.round(config.pricePerDay * dias * 100) / 100 : 0
  const vitrineCheia = config ? new Date(config.nextStart).getTime() - Date.now() > 60 * 60 * 1000 : false

  const faltando = useMemo(() => {
    if (!arte) return 'Escolha a arte do anúncio'
    if ((destino === 'WHATSAPP' || destino === 'URL') && !alvo.trim()) return destino === 'WHATSAPP' ? 'Informe o WhatsApp' : 'Informe o link'
    if (empresa.trim().length < 2) return 'Informe o nome da empresa'
    const d = documento.replace(/\D/g, '')
    if (d.length !== 11 && d.length !== 14) return 'Informe o CPF ou CNPJ'
    return null
  }, [arte, destino, alvo, empresa, documento])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (faltando || !arte || enviando) return
    setErroEnvio('')
    setEnviando(true)
    try {
      await api.post('/ads', {
        companyName: empresa.trim(),
        document: documento,
        imageUrl: arte.url,
        days: dias,
        linkType: destino,
        linkTarget: destino === 'URL' || destino === 'WHATSAPP' ? alvo.trim() : undefined,
      })
      router.push('/meus-anuncios?enviado=1')
    } catch (err: any) {
      const m = err?.response?.data?.message
      setErroEnvio(Array.isArray(m) ? m.join(', ') : m ?? 'Não foi possível enviar agora.')
    } finally {
      setEnviando(false)
    }
  }

  if (!ready || !user) {
    return <div className={styles.carregando}>Carregando…</div>
  }

  const preenche = arte ? arte.proporcao >= 2.2 && arte.proporcao <= 4 : true
  const destinos: [AdLinkType, React.ReactNode, string][] = [
    ...(temLoja ? [['STORE', <Store key="s" size={16} />, 'Minha loja'] as [AdLinkType, React.ReactNode, string]] : []),
    ['WHATSAPP', <MessageCircle key="w" size={16} />, 'WhatsApp'],
    ['URL', <Globe key="u" size={16} />, 'Site'],
    ['NONE', <Eye key="n" size={16} />, 'Só exibir'],
  ]

  return (
    <div className={`container ${styles.pagina}`}>
      <div className={styles.topo}>
        <div>
          <h1 className={styles.titulo}>Anunciar na vitrine</h1>
          <p className={styles.sub}>Sua arte gira no topo da tela inicial do app e do site. Você só paga depois que a gente aprovar.</p>
        </div>
        <Link href="/meus-anuncios" className={styles.linkSec}>Meus anúncios →</Link>
      </div>

      {erroConfig ? (
        <LoadError onRetry={carregar} sub="Não conseguimos carregar os preços. Verifique a conexão." />
      ) : !config ? (
        <div className={styles.carregando}>Carregando…</div>
      ) : (
        <form className={styles.grade} onSubmit={enviar}>
          <div className={styles.coluna}>
            <section className={styles.bloco}>
              <h2 className={styles.rotulo}>Arte do anúncio</h2>
              <button type="button" className={styles.previa} onClick={() => inputArte.current?.click()} disabled={enviandoArte}>
                {arte ? (
                  <>
                    {/* eslint-disable @next/next/no-img-element */}
                    {!preenche && <img src={arte.url} alt="" className={styles.previaFundo} />}
                    <img src={arte.url} alt="Prévia da arte" className={preenche ? styles.previaCover : styles.previaContain} />
                    {/* eslint-enable @next/next/no-img-element */}
                    <span className={styles.selo}>Patrocinado</span>
                  </>
                ) : (
                  <span className={styles.previaVazia}>
                    <ImagePlus size={26} />
                    <strong>Escolher arte</strong>
                    <span>Ideal: 1200 × 400 px, horizontal</span>
                  </span>
                )}
                {enviandoArte && <span className={styles.previaCarregando}><Loader2 size={22} className={styles.gira} /></span>}
              </button>
              <input
                ref={inputArte} type="file" accept="image/jpeg,image/png,image/webp" hidden
                onChange={(e) => aoEscolher(e.target.files?.[0])}
              />
              {arte && (
                <button type="button" className={styles.trocar} onClick={() => inputArte.current?.click()}>
                  <RefreshCw size={13} /> Trocar arte
                </button>
              )}
              {erroArte && <p className={styles.erro}>{erroArte}</p>}
              <p className={styles.dica}>Pouco texto e letra grande: no celular o card aparece pequeno. Imagem quadrada também serve — ela vai inteira no meio.</p>
            </section>

            <section className={styles.bloco}>
              <h2 className={styles.rotulo}>Quem clicar no anúncio vai para</h2>
              <div className={styles.opcoes} role="radiogroup" aria-label="Destino do anúncio">
                {destinos.map(([v, icone, label]) => (
                  <button
                    key={v} type="button" role="radio" aria-checked={destino === v}
                    className={`${styles.opcao} ${destino === v ? styles.opcaoOn : ''}`}
                    onClick={() => { setDestino(v); setAlvo('') }}
                  >
                    {icone} {label}
                  </button>
                ))}
              </div>
              {destino === 'WHATSAPP' && (
                <input id="ad-whatsapp" className={styles.input} placeholder="(69) 99999-9999" inputMode="tel"
                  value={alvo} onChange={(e) => setAlvo(formatPhone(e.target.value))} aria-label="WhatsApp" />
              )}
              {destino === 'URL' && (
                <input id="ad-url" className={styles.input} placeholder="https://seusite.com.br" inputMode="url"
                  value={alvo} onChange={(e) => setAlvo(e.target.value)} aria-label="Link do site" />
              )}
            </section>

            <section className={styles.bloco}>
              <h2 className={styles.rotulo}>Dados para a nota fiscal</h2>
              <div className={styles.campos}>
                <input id="ad-empresa" className={styles.input} placeholder="Nome da empresa" maxLength={80}
                  value={empresa} onChange={(e) => setEmpresa(e.target.value)} aria-label="Nome da empresa" />
                <input id="ad-documento" className={styles.input} placeholder="CNPJ ou CPF" inputMode="numeric"
                  value={documento} onChange={(e) => setDocumento(mascaraDocumento(e.target.value))} aria-label="CNPJ ou CPF" />
              </div>
            </section>
          </div>

          <aside className={styles.resumo}>
            <h2 className={styles.rotulo}>Quantos dias</h2>
            <div className={styles.dias}>
              <button type="button" className={styles.passo} aria-label="Menos um dia"
                onClick={() => setDias((d) => Math.max(config.minDays, d - 1))} disabled={dias <= config.minDays}>
                <Minus size={18} />
              </button>
              <div className={styles.diasNum}><strong>{dias}</strong><span>dias</span></div>
              <button type="button" className={styles.passo} aria-label="Mais um dia"
                onClick={() => setDias((d) => Math.min(config.maxDays, d + 1))} disabled={dias >= config.maxDays}>
                <Plus size={18} />
              </button>
            </div>
            <div className={styles.atalhos}>
              {[7, 15, 30].filter((n) => n >= config.minDays && n <= config.maxDays).map((n) => (
                <button key={n} type="button" className={`${styles.atalho} ${dias === n ? styles.atalhoOn : ''}`} onClick={() => setDias(n)}>
                  {n} dias
                </button>
              ))}
            </div>
            <div className={styles.conta}>
              <span>{brl(config.pricePerDay)} por dia × {dias}</span>
              <strong>{brl(total)}</strong>
            </div>

            <ul className={styles.passos}>
              <li><Clock size={16} /> A equipe confere a arte, normalmente no mesmo dia.</li>
              <li><QrCode size={16} /> Aprovado, você paga o PIX em até {config.payDeadlineDays} dias.</li>
              <li>
                <Rocket size={16} />
                {vitrineCheia
                  ? `A vitrine está cheia agora: a próxima vaga abre em ${dataCurta(config.nextStart)}. Seu anúncio entra assim que abrir.`
                  : 'Pagou, entrou no ar na hora.'}
              </li>
            </ul>

            {erroEnvio && <p className={styles.erro}>{erroEnvio}</p>}
            <button type="submit" className={styles.cta} disabled={!!faltando || enviando}>
              {enviando ? <Loader2 size={18} className={styles.gira} /> : 'Enviar para aprovação'}
            </button>
            <p className={styles.ctaSub}>{faltando ?? 'Só cobra depois de aprovado'}</p>
          </aside>
        </form>
      )}
    </div>
  )
}

export default function AnunciarPage() {
  return (
    <>
      <Navbar />
      <Suspense fallback={null}>
        <Anunciar />
      </Suspense>
    </>
  )
}
