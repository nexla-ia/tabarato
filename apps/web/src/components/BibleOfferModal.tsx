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
          O Tá Barato tem um presente para você!
        </h2>

        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4, margin: '6px 0 0' }}>
          Você quer ganhar um exemplar da Bíblia sem custo?
        </p>

        <ul
          style={{
            fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5,
            margin: '14px 0 0', paddingLeft: 18, display: 'grid', gap: 7,
          }}
        >
          <li>O envio será gratuito via Correios.</li>
          <li>Seus dados cadastrados serão usados exclusivamente para esta entrega.</li>
        </ul>

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
            {saving ? 'Enviando…' : 'Sim, quero receber'}
          </button>
        </div>
      </div>
    </div>
  )
}
