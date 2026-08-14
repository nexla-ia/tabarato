'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Wallet as WalletIcon, Receipt, X, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { Wallet, Transaction, money, timeAgo } from '@/lib/types'
import { Spinner } from '@/components/Spinner'
import styles from './page.module.css'

export default function CarteiraPage() {
  const walletQ = useQuery<Wallet>({ queryKey: ['wallet'], queryFn: async () => (await api.get('/stores/my/wallet')).data })

  const [receiptText, setReceiptText] = useState<string | null>(null)
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null)

  async function viewReceipt(txId: string) {
    setLoadingReceiptId(txId)
    try {
      const { data } = await api.get(`/stores/my/transactions/${txId}/receipt`, { responseType: 'text' })
      setReceiptText(typeof data === 'string' ? data : String(data))
    } catch {
      setReceiptText('Não foi possível carregar o recibo.')
    } finally {
      setLoadingReceiptId(null)
    }
  }

  if (walletQ.isLoading) return <Spinner />

  const wallet = walletQ.data
  const transactions = wallet?.transactions ?? []

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Carteira</h1>
      <p className={styles.subtitle}>Saldo e histórico de transações</p>

      <div className={styles.balanceCard}>
        <div className={styles.balanceLabel}><WalletIcon size={15} /> Saldo</div>
        <div className={styles.balanceValue}>{money(wallet?.balance ?? 0)}</div>
      </div>
      <p className={styles.hint} style={{ marginTop: 10 }}>
        O pagamento das suas vendas cai direto na sua conta Mercado Pago conectada — é automático, não precisa sacar daqui. Esse saldo só existe se algum pedido específico não puder usar o Mercado Pago da loja e ficar centralizado na plataforma; nesse caso, nossa equipe entra em contato pra fazer o repasse.
      </p>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardIcon}><Receipt size={18} /></span>
          <div>
            <div className={styles.cardTitle}>Extrato</div>
            <div className={styles.cardSub}>Últimas {transactions.length} movimentações.</div>
          </div>
        </div>

        {transactions.length === 0 ? (
          <p className={styles.empty}>Nenhuma movimentação ainda.</p>
        ) : (
          <div className={styles.txList} style={{ marginTop: 8 }}>
            {transactions.map((tx: Transaction) => (
              <div key={tx.id} className={styles.txRow}>
                <div className={styles.txDesc}>
                  <div className={styles.txText}>{tx.description ?? (tx.type === 'CREDIT' ? 'Crédito' : 'Débito')}</div>
                  <div className={styles.txDate}>{timeAgo(tx.createdAt)}</div>
                </div>
                <span className={`${styles.txAmount} ${tx.type === 'CREDIT' ? styles.txCredit : styles.txDebit}`}>
                  {tx.type === 'CREDIT' ? '+' : '−'} {money(tx.amount)}
                </span>
                <button className={styles.receiptBtn} onClick={() => viewReceipt(tx.id)} title="Ver recibo" disabled={loadingReceiptId === tx.id}>
                  {loadingReceiptId === tx.id ? <Loader2 size={14} className={styles.spin} /> : <Receipt size={14} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {receiptText !== null && (
        <div className={styles.overlay} onClick={() => setReceiptText(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3>Recibo</h3>
              <button onClick={() => setReceiptText(null)}><X size={18} /></button>
            </div>
            <pre className={styles.receiptPre}>{receiptText}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
