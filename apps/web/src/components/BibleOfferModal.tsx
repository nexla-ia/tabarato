'use client'
import { BookOpen } from 'lucide-react'

/**
 * Cortesia da Bíblia, oferecida logo depois de criar a conta.
 *
 * Duas decisões que vêm da LGPD, não de estética:
 *
 * 1. As duas respostas têm o mesmo peso visual. "Não, obrigado" não é link
 *    apagado nem texto pequeno — consentimento para dado sensível precisa ser
 *    livre, e botão de recusa escondido é o oposto disso.
 * 2. O texto diz o que acontece com o aceite (nome e endereço vão para a
 *    plataforma preparar a postagem). Consentimento sem finalidade declarada
 *    não vale.
 *
 * Sem "X" de fechar e sem fechar clicando fora: o modal só sai por uma das duas
 * respostas, senão a pergunta voltaria no próximo acesso e viraria insistência.
 */
export function BibleOfferModal({
  open,
  saving,
  onAnswer,
}: {
  open: boolean
  saving: boolean
  onAnswer: (accepted: boolean) => void
}) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bible-offer-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000, padding: 20,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: 'var(--card)', borderRadius: 20, padding: 26,
          width: 'min(420px, 100%)', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <div
          style={{
            width: 52, height: 52, borderRadius: 15, marginBottom: 16,
            background: 'var(--orange-light, #FFF0EB)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <BookOpen size={25} style={{ color: 'var(--orange)' }} />
        </div>

        <h2
          id="bible-offer-title"
          style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', margin: '0 0 8px', letterSpacing: '-0.3px' }}
        >
          Um presente para você
        </h2>

        <p style={{ fontSize: 14.5, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
          O Tá Barato quer enviar, de cortesia, um exemplar da Bíblia para a sua casa.
          Não custa nada e não tem pegadinha — é um presente de boas-vindas.
        </p>

        <p
          style={{
            fontSize: 12.5, color: 'var(--faint, var(--muted))', lineHeight: 1.45,
            margin: '12px 0 0', paddingTop: 12, borderTop: '1px solid var(--border)',
          }}
        >
          Se aceitar, usamos seu nome e o endereço de entrega cadastrado no site só para
          fazer a postagem pelos Correios. Você pode desistir quando quiser.
        </p>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            onClick={() => onAnswer(false)}
            disabled={saving}
            style={{
              flex: 1, height: 46, borderRadius: 12, cursor: saving ? 'default' : 'pointer',
              background: 'transparent', border: '1px solid var(--border)',
              fontSize: 14.5, fontWeight: 700, color: 'var(--muted)',
            }}
          >
            Não, obrigado
          </button>
          <button
            onClick={() => onAnswer(true)}
            disabled={saving}
            autoFocus
            style={{
              flex: 1, height: 46, borderRadius: 12, border: 'none',
              cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
              background: 'var(--orange)', color: '#fff',
              fontSize: 14.5, fontWeight: 800,
            }}
          >
            {saving ? 'Enviando…' : 'Quero receber'}
          </button>
        </div>
      </div>
    </div>
  )
}
