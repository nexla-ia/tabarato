'use client'
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wallet as WalletIcon, KeyRound, Receipt, X, Loader2, Pencil } from 'lucide-react'
import { api } from '@/lib/api'
import { Wallet, Transaction, money, timeAgo } from '@/lib/types'
import { formatMoneyInput, moneyInputToNumber, onlyDigits } from '@/lib/masks'
import styles from './page.module.css'

export default function CarteiraPage() {
  const qc = useQueryClient()
  const walletQ = useQuery<Wallet>({ queryKey: ['wallet'], queryFn: async () => (await api.get('/stores/my/wallet')).data })

  const [editingPix, setEditingPix] = useState(false)
  const [pixKey, setPixKey] = useState('')
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawError, setWithdrawError] = useState('')
  const [withdrawMsg, setWithdrawMsg] = useState('')
  const [receiptText, setReceiptText] = useState<string | null>(null)
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null)

  useEffect(() => { setPixKey(walletQ.data?.pixKey ?? '') }, [walletQ.data?.pixKey])

  const savePix = useMutation({
    mutationFn: async () => (await api.patch('/stores/my/pix', { pixKey: pixKey.trim() })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wallet'] }); setEditingPix(false) },
  })

  const withdraw = useMutation({
    mutationFn: async () => (await api.post('/stores/my/wallet/withdraw', { amount: moneyInputToNumber(withdrawAmount) })).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['wallet'] })
      setWithdrawAmount('')
      setWithdrawError('')
      setWithdrawMsg(data?.message ?? 'Saque solicitado com sucesso.')
      setTimeout(() => { setWithdrawOpen(false); setWithdrawMsg('') }, 2000)
    },
    onError: (err: any) => setWithdrawError(err.response?.data?.message ?? 'Não foi possível solicitar o saque.'),
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

  if (walletQ.isLoading) return <div className={styles.loading}>Carregando…</div>

  const wallet = walletQ.data
  const transactions = wallet?.transactions ?? []

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Carteira</h1>
      <p className={styles.subtitle}>Saldo, saques e histórico de transações</p>

      <div className={styles.balanceCard}>
        <div className={styles.balanceLabel}><WalletIcon size={15} /> Saldo disponível</div>
        <div className={styles.balanceValue}>{money(wallet?.balance ?? 0)}</div>
        <button
          className={styles.withdrawBtn}
          onClick={() => { setWithdrawOpen(true); setWithdrawError('') }}
          disabled={!wallet || wallet.balance <= 0}
        >
          Sacar via PIX
        </button>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardIcon}><KeyRound size={18} /></span>
          <div>
            <div className={styles.cardTitle}>Chave PIX de recebimento</div>
            <div className={styles.cardSub}>Pra onde enviamos o valor dos seus saques.</div>
          </div>
        </div>

        {editingPix ? (
          <>
            <input
              className={styles.input} style={{ marginTop: 14 }}
              value={pixKey} onChange={(e) => setPixKey(e.target.value)}
              placeholder="CPF, CNPJ, e-mail ou telefone"
            />
            <div className={styles.pixActions}>
              <button
                className={`${styles.smallBtn} ${styles.smallBtnPrimary}`}
                onClick={() => savePix.mutate()}
                disabled={savePix.isPending || !pixKey.trim()}
              >
                {savePix.isPending ? 'Salvando…' : 'Salvar'}
              </button>
              <button className={`${styles.smallBtn} ${styles.smallBtnGhost}`} onClick={() => { setEditingPix(false); setPixKey(wallet?.pixKey ?? '') }}>
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <div className={styles.pixRow}>
            {wallet?.pixKey
              ? <span className={styles.pixValue}>{wallet.pixKey}</span>
              : <span className={styles.pixEmpty}>Nenhuma chave cadastrada</span>}
            <button className={styles.linkBtn} onClick={() => setEditingPix(true)}>
              <Pencil size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
              {wallet?.pixKey ? 'Trocar' : 'Cadastrar'}
            </button>
          </div>
        )}
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

      {withdrawOpen && (
        <div className={styles.overlay} onClick={() => setWithdrawOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3>Sacar via PIX</h3>
              <button onClick={() => setWithdrawOpen(false)}><X size={18} /></button>
            </div>

            <p className={styles.cardSub}>Saldo disponível: <strong>{money(wallet?.balance ?? 0)}</strong></p>

            <label className={styles.linkBtn} style={{ display: 'block', margin: '14px 0 6px', color: 'var(--muted)', fontSize: 12, fontWeight: 700 }}>Valor a sacar (R$)</label>
            <input
              className={styles.input} inputMode="numeric"
              value={formatMoneyInput(withdrawAmount)}
              onChange={(e) => setWithdrawAmount(onlyDigits(e.target.value))}
              placeholder="0,00"
            />

            {!wallet?.pixKey && <p className={styles.err}>Cadastre sua chave PIX de recebimento antes de sacar.</p>}
            {withdrawError && <p className={styles.err}>{withdrawError}</p>}
            {withdrawMsg && <p className={styles.cardSub} style={{ color: 'var(--green)', fontWeight: 700, marginTop: 8 }}>{withdrawMsg}</p>}

            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setWithdrawOpen(false)}>Cancelar</button>
              <button
                className={styles.modalConfirm}
                onClick={() => withdraw.mutate()}
                disabled={withdraw.isPending || !wallet?.pixKey || moneyInputToNumber(withdrawAmount) <= 0 || moneyInputToNumber(withdrawAmount) > (wallet?.balance ?? 0)}
              >
                {withdraw.isPending ? 'Solicitando…' : 'Confirmar saque'}
              </button>
            </div>
          </div>
        </div>
      )}

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
