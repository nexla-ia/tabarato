import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { VIGENCIA } from '@/lib/legal'
import styles from './LegalPage.module.css'

/**
 * Casca compartilhada por /termos e /privacidade: barra de topo, título com
 * vigência/versão e a navegação cruzada entre os dois documentos. O conteúdo
 * vem por children pra cada página manter seu próprio texto.
 */
export function LegalPage({
  title, versao, outro, children,
}: {
  title: string
  versao: string
  /** Link pro documento irmão, exibido no rodapé. */
  outro: { href: string; label: string }
  children: React.ReactNode
}) {
  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link href="/" className={styles.back}><ArrowLeft size={15} /> Voltar ao início</Link>
          <span className={styles.topbarBrand}>Tá Barato</span>
        </div>
      </div>

      <div className={styles.wrap}>
        <header className={styles.head}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.meta}>
            Vigente desde {VIGENCIA}
            <span className={styles.metaSep}>·</span>
            versão {versao}
          </p>
        </header>

        <article className={styles.body}>{children}</article>

        <footer className={styles.foot}>
          <Link href={outro.href}>{outro.label} →</Link>
          <span className={styles.footNote}>Tá Barato · Vilhena — RO</span>
        </footer>
      </div>
    </div>
  )
}

/** Bloco destacado — usado pra chamar atenção a um direito ou a um limite. */
export function Callout({ children }: { children: React.ReactNode }) {
  return <div className={styles.callout}>{children}</div>
}

/** Tabela com rolagem horizontal própria (não deixa a página rolar de lado). */
export function LegalTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
