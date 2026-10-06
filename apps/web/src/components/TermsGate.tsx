'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { api } from '@/lib/api'
import { TERMOS_LOJISTA_VERSAO } from '@/lib/legal'
import { useDialogs } from './Dialogs'

/**
 * Aceite dos Termos do Lojista para quem já tinha loja.
 *
 * As lojas criadas antes de existir registro de aceite têm `termsAcceptedAt`
 * nulo — não dá pra inventar uma data pra elas, então o aceite é pedido aqui, na
 * primeira vez que o lojista abre o painel. O mesmo aviso reaparece quando a
 * versão do texto muda, que é o ponto de ter versão: aceite de um texto antigo
 * não vale como aceite do novo.
 *
 * Avisa, não bloqueia: a loja continua operando enquanto não aceita. Travar o
 * painel de quem já vende seria punir o lojista por uma lacuna nossa.
 */
export function TermsGate({
  termsAcceptedAt,
  termsVersion,
}: {
  termsAcceptedAt?: string | null
  termsVersion?: string | null
}) {
  const qc = useQueryClient()
  const { toast } = useDialogs()
  const [saving, setSaving] = useState(false)

  const pendente = !termsAcceptedAt || termsVersion !== TERMOS_LOJISTA_VERSAO
  if (!pendente) return null

  const primeiroAceite = !termsAcceptedAt

  async function aceitar() {
    setSaving(true)
    try {
      await api.post('/stores/my/accept-terms', { version: TERMOS_LOJISTA_VERSAO })
      await qc.invalidateQueries({ queryKey: ['store-my'] })
      toast('Aceite registrado. Obrigado!', 'success')
    } catch {
      toast('Não foi possível registrar o aceite agora. Tente novamente.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="region"
      aria-label="Aceite dos Termos do Lojista"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
        margin: '0 0 18px', padding: '14px 16px',
        background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12,
      }}
    >
      <FileText size={18} style={{ color: '#C2410C', flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#7C2D12', marginBottom: 3 }}>
          {primeiroAceite ? 'Confirme os Termos do Lojista' : 'Os Termos do Lojista foram atualizados'}
        </div>
        <p style={{ fontSize: 13, color: '#9A3412', lineHeight: 1.55, margin: 0 }}>
          {primeiroAceite
            ? 'Sua loja foi criada antes de passarmos a registrar o aceite. Leia e confirme para deixarmos registrado o que vale para a sua operação — comissão, repasse e saque.'
            : 'O texto mudou desde a última vez que você aceitou. Leia a versão nova e confirme.'}{' '}
          <Link
            href="/termos/lojista"
            target="_blank"
            style={{ color: '#C2410C', fontWeight: 700, textDecoration: 'underline' }}
          >
            Ler os Termos do Lojista
          </Link>
        </p>
      </div>
      <button
        onClick={aceitar}
        disabled={saving}
        style={{
          padding: '9px 18px', borderRadius: 9, border: 'none', cursor: saving ? 'default' : 'pointer',
          background: '#EA580C', color: '#fff', fontSize: 13.5, fontWeight: 800,
          display: 'flex', alignItems: 'center', gap: 7, opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? 'Registrando…' : 'Li e aceito'}
      </button>
    </div>
  )
}
