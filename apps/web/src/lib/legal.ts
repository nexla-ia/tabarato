/**
 * Dados institucionais e versões dos documentos legais.
 *
 * ⚠️ RASCUNHO — os textos de /termos e /privacidade descrevem fielmente o que o
 * app faz hoje, mas NÃO foram revisados por advogado. Passe por revisão jurídica
 * antes de tratar como instrumento contratual válido.
 *
 * TODO(empresa): preencher os campos marcados como PENDENTE com os dados reais
 * da pessoa jurídica que opera o Tá Barato. Enquanto estiverem pendentes, as
 * páginas renderizam um aviso no lugar do dado.
 */

export const EMPRESA = {
  nomeFantasia: 'Tá Barato',
  razaoSocial: '' as string,   // PENDENTE — ex: 'Tá Barato Tecnologia LTDA'
  cnpj: '' as string,          // PENDENTE — CNPJ da operadora
  endereco: 'Vilhena — RO',
  emailContato: '' as string,  // PENDENTE — ex: 'contato@tabarato.com.br'
  emailPrivacidade: '' as string, // PENDENTE — canal do encarregado (LGPD)
  cidadeForo: 'Vilhena',
  ufForo: 'RO',
} as const

/** Bump ao alterar o texto — é o que o aceite do usuário referencia. */
export const TERMOS_VERSAO = '2026-08-26'
export const PRIVACIDADE_VERSAO = '2026-08-26'

/** Exibido no cabeçalho das páginas legais. */
export const VIGENCIA = '26 de agosto de 2026'

/** Números que aparecem no texto e vivem no código da API — mantenha em sincronia. */
export const REGRAS = {
  /** apps/api/src/orders/orders.service.ts — platformCommission */
  comissaoPlataformaPct: 10,
  /** apps/api/src/orders/orders.service.ts — calcCourierFee */
  entregaBase: 10,
  entregaPorKm: 2,
  /** apps/api/src/loyalty/loyalty.service.ts */
  pontosPorReal: 1,
  pontosParaDesconto: 100,
  descontoPorLote: 10,
  bonusIndicacao: 50,
} as const

/** Fallback visível quando um dado institucional ainda não foi preenchido. */
export function pendente(valor: string, rotulo: string): string {
  return valor.trim() || `[${rotulo} a preencher]`
}
