'use client'
import { CloudOff } from 'lucide-react'

/**
 * Estado de ERRO de carregamento.
 *
 * Existe porque `.catch(() => {})` fazia a tela cair no estado vazio
 * ("você ainda não fez nenhum pedido") quando na verdade a rede falhou — o
 * usuário acreditava ter perdido os dados. Falha e lista vazia são coisas
 * diferentes e precisam parecer diferentes.
 */
export function LoadError({
  onRetry,
  title = 'Não foi possível carregar',
  sub = 'Verifique sua conexão e tente novamente.',
}: {
  onRetry: () => void
  title?: string
  sub?: string
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      padding: '56px 20px', textAlign: 'center',
    }}>
      <CloudOff size={44} color="var(--muted)" />
      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{title}</div>
      <div style={{ fontSize: 13.5, color: 'var(--muted)', maxWidth: 320, lineHeight: 1.5 }}>{sub}</div>
      <button
        onClick={onRetry}
        style={{
          marginTop: 6, background: 'var(--orange)', color: '#fff', border: 'none',
          borderRadius: 10, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
        }}
      >Tentar novamente</button>
    </div>
  )
}
