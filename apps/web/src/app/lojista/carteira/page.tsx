'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wallet as WalletIcon, Receipt, X, Loader2, Check } from 'lucide-react'
import { api } from '@/lib/api'
import { Wallet, Transaction, money, timeAgo } from '@/lib/types'
import { Spinner } from '@/components/Spinner'
import styles from './page.module.css'

export default function CarteiraPage() {
  const qc = useQueryClient()
  const walletQ = useQuery<Wallet>({ queryKey: ['wallet'], queryFn: async () => (await api.get('/stores/my/wallet')).data })

  const [receiptText, setReceiptText] = useState<string | null>(null)
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null)
  const [pixKey, setPixKey] = useState('')
  const [pixSaved, setPixSaved] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => { if (walletQ.data?.pixKey != null) setPixKey(walletQ.data.pixKey) }, [walletQ.data?.pixKey])

  const savePix = useMutation({
    mutationFn: async () => (await api.patch('/stores/my/pix', { pixKey: pixKey.trim() })).data,
    onSuccess: () => { setPixSaved(true); setTimeout(() => setPixSaved(false), 2500); qc.invalidateQueries({ queryKey: ['wallet'] }) },
    onError: (e: any) => setMsg(e?.response?.data?.message ?? 'Não foi possível salvar a chave PIX.'),
  })
  const withdraw = useMutation({
    mutationFn: async () => (await api.post('/stores/my/wallet/withdraw', { amount: Number(withdrawAmount.replace(',', '.')) })).data,
    onSuccess: () => { setWithdrawAmount(''); setMsg('Saque solicitado! O valor cai na sua chave PIX.'); qc.invalidateQueries({ queryKey: ['wallet'] }) },
    onError: (e: any) => setMsg(e?.response?.data?.message ?? 'Não foi possível solicitar o saque.'),
  })

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
        O valor das suas vendas é creditado aqui quando o pedido é entregue. Cadastre sua chave PIX e solicite o saque quando quiser.
      </p>

      {/* Chave PIX + Saque */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>Chave PIX para saque</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input
            value={pixKey}
            onChange={(e) => setPixKey(e.target.value)}
            placeholder="CPF/CNPJ, e-mail, telefone ou chave aleatória"
            style={{ flex: 1, minWidth: 200, padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border, #e5e5e5)', fontSize: 14 }}
          />
          <button
            onClick={() => { setMsg(''); savePix.mutate() }}
            disabled={savePix.isPending || !pixKey.trim()}
            style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: 'var(--primary, #FF6600)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >{pixSaved ? <><Check size={15} style={{ verticalAlign: -2 }} /> Salvo</> : savePix.isPending ? 'Salvando…' : 'Salvar'}</button>
        </div>

        <div className={styles.cardTitle} style={{ marginTop: 18 }}>Solicitar saque</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input
            inputMode="decimal"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
            placeholder="0,00"
            style={{ flex: 1, minWidth: 140, padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border, #e5e5e5)', fontSize: 14 }}
          />
          <button
            onClick={() => { setMsg(''); withdraw.mutate() }}
            disabled={withdraw.isPending || !pixKey.trim() || !withdrawAmount || (wallet?.balance ?? 0) <= 0}
            style={{ padding: '10px 16px', borderRadius: 10, border: '1.5px solid var(--primary, #FF6600)', background: 'transparent', color: 'var(--primary, #FF6600)', fontWeight: 700, cursor: 'pointer' }}
          >{withdraw.isPending ? 'Solicitando…' : 'Solicitar saque'}</button>
        </div>
        <p className={styles.hint} style={{ marginTop: 8 }}>Saque disponível: {money(wallet?.balance ?? 0)}. Cadastre a chave PIX antes de sacar.</p>
        {msg && <p style={{ fontSize: 13, marginTop: 6, color: msg.includes('solicitado') ? '#16A34A' : '#DC2626' }}>{msg}</p>}
      </div>

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
