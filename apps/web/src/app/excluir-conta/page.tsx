'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { EMPRESA } from '@/lib/legal'
import styles from './excluir-conta.module.css'

/**
 * Exclusão de conta. Também é a página pública que o Google Play pede ("link
 * para solicitar a exclusão da conta"): quem não está logado vê como funciona e
 * entra para excluir; quem não consegue entrar, pede por e-mail.
 */
export default function ExcluirContaPage() {
  const router = useRouter()
  const { user, ready, logout } = useAuth()
  const [check, setCheck] = useState<{ canDelete: boolean; motivos: string[] } | null>(null)
  const [erro, setErro] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [excluindo, setExcluindo] = useState(false)
  const [excluida, setExcluida] = useState(false)

  useEffect(() => {
    if (!ready || !user) return
    api.get('/users/me/deletion-check')
      .then((r) => setCheck(r.data))
      .catch(() => setErro('Não conseguimos verificar sua conta agora. Tente de novo em instantes.'))
  }, [ready, user])

  async function excluir(e: React.FormEvent) {
    e.preventDefault()
    if (confirmacao.trim().toUpperCase() !== 'EXCLUIR' || excluindo) return
    setExcluindo(true)
    setErro('')
    try {
      await api.delete('/users/me', { data: { confirm: 'EXCLUIR' } })
      logout()
      setExcluida(true)
    } catch (err: any) {
      setErro(err?.response?.data?.message ?? 'Não foi possível excluir agora.')
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <>
      <Navbar />
      <main className={`container ${styles.pagina}`}>
        <h1 className={styles.titulo}>Excluir conta</h1>

        {excluida ? (
          <section className={styles.cartao}>
            <p className={styles.texto}><strong>Sua conta foi excluída.</strong> Obrigado por ter usado o Tá Barato.</p>
            <button type="button" className={styles.secundario} onClick={() => router.push('/')}>Voltar para o início</button>
          </section>
        ) : (
          <>
            <section className={styles.cartao}>
              <h2 className={styles.subtitulo}>O que acontece</h2>
              <ul className={styles.lista}>
                <li>Seu nome, e-mail, telefone, CPF, endereços e favoritos são apagados, e você sai do app e do site em todos os aparelhos.</li>
                <li>Pedidos e pagamentos antigos ficam registrados sem seus dados pessoais, porque a lei exige guardar o histórico fiscal.</li>
                <li>Se você tem loja, ela sai do ar na hora; os dados da empresa (CNPJ) ficam guardados pelo prazo legal. Se é entregador, CPF e CNH ficam guardados pelo prazo legal das entregas feitas.</li>
                <li>Não dá para desfazer.</li>
              </ul>
            </section>

            {!ready ? null : !user ? (
              <section className={styles.cartao}>
                <p className={styles.texto}>Entre na sua conta para excluí-la. A exclusão também pode ser feita no app, em Perfil › Excluir conta.</p>
                <Link href="/login?redirect=/excluir-conta" className={styles.botaoNeutro}>Entrar para excluir</Link>
                <p className={styles.nota}>
                  Não consegue entrar? Peça a exclusão pelo e-mail{' '}
                  <a href={`mailto:${EMPRESA.emailPrivacidade}?subject=Excluir%20minha%20conta`}>{EMPRESA.emailPrivacidade}</a>,
                  {' '}de preferência a partir do e-mail cadastrado.
                </p>
              </section>
            ) : !check ? (
              <section className={styles.cartao}>
                {erro ? <p className={styles.erro}>{erro}</p> : <Loader2 size={22} className={styles.gira} />}
              </section>
            ) : !check.canDelete ? (
              <section className={`${styles.cartao} ${styles.bloqueio}`}>
                <h2 className={styles.subtitulo}><AlertTriangle size={18} /> Antes de excluir, resolva isto</h2>
                <ul className={styles.lista}>
                  {check.motivos.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </section>
            ) : (
              <form className={styles.cartao} onSubmit={excluir}>
                <label htmlFor="confirmacao" className={styles.subtitulo}>Para confirmar, digite EXCLUIR</label>
                <input
                  id="confirmacao"
                  className={styles.input}
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  autoComplete="off"
                  placeholder="EXCLUIR"
                />
                {erro && <p className={styles.erro}>{erro}</p>}
                <button
                  type="submit"
                  className={styles.perigo}
                  disabled={confirmacao.trim().toUpperCase() !== 'EXCLUIR' || excluindo}
                >
                  {excluindo ? <Loader2 size={18} className={styles.gira} /> : 'Excluir minha conta'}
                </button>
              </form>
            )}
          </>
        )}
      </main>
    </>
  )
}
