import { BASE } from './api'

/**
 * Dados institucionais e versões dos documentos legais.
 *
 * ⚠️ RASCUNHO — os textos de /termos, /termos/lojista e /privacidade descrevem
 * fielmente o que o app faz hoje, mas NÃO foram revisados por advogado. Passe por
 * revisão jurídica antes de tratar como instrumento contratual válido.
 *
 * TODO(empresa): preencher os campos marcados como PENDENTE com os dados reais de
 * quem opera o Tá Barato. Enquanto estiverem pendentes, as páginas renderizam um
 * aviso no lugar do dado.
 *
 * PENDENTE DE ADVOGADO, hoje sem resposta no texto:
 *   1. Chargeback e retenção de saldo (Callout marcado em /termos/lojista).
 *   2. NATUREZA DA OPERAÇÃO FINANCEIRA. A cliente enviou cláusula dizendo que a
 *      plataforma "não retém valores" e que o repasse segue "regras de split".
 *      Isso descreve o modelo que foi RECUSADO. O sistema recebe tudo numa conta
 *      só e retém até a loja sacar — ver [[project_store_payment_model]]. Reter
 *      dinheiro de terceiro é atividade regulada pelo Bacen; o advogado precisa
 *      analisar sabendo que o modelo é centralizado, não split.
 *
 * A operadora será PESSOA JURÍDICA — confirmado pela cliente em 06/10/2026, os
 * dados do CNPJ virão dela. Por isso o texto em cima de "razão social / CNPJ"
 * está correto e é só preencher aqui; antes dessa definição ele não casava com a
 * operação, que era pessoa física.
 */

export const EMPRESA = {
  nomeFantasia: 'Tá Barato',
  razaoSocial: '' as string,   // PENDENTE — ex: 'Tá Barato Tecnologia LTDA'
  cnpj: '' as string,          // PENDENTE — CNPJ da operadora
  endereco: 'Vilhena — RO',
  emailContato: '' as string,  // PENDENTE — ex: 'contato@tabarato.com.br'
  // Informado pela cliente como 'privacidade@tabarato.com.br' — dominio errado,
  // esse nao e dela. Corrigido para o dominio real. A CAIXA PRECISA EXISTIR:
  // canal de encarregado que nao recebe e-mail e descumprimento do art. 41 da LGPD.
  emailPrivacidade: 'privacidade@tabaratoapp.com.br' as string,
  cidadeForo: 'Vilhena',
  ufForo: 'RO',
} as const

/** Bump ao alterar o texto — é o que o aceite do usuário referencia. */
export const TERMOS_VERSAO = '2026-10-16'
export const PRIVACIDADE_VERSAO = '2026-10-16'

/**
 * Versão dos Termos do Lojista. É gravada em `stores.terms_version` no aceite,
 * e o painel do lojista compara com ela pra saber se precisa pedir o aceite de
 * novo. Bump SÓ quando o texto mudar de verdade.
 */
export const TERMOS_LOJISTA_VERSAO = '2026-10-06'

/**
 * Vigência por extenso, derivada da própria versão do documento.
 *
 * Era uma constante única para as três páginas, o que dava errado de dois jeitos:
 * quem subia a versão esquecia de mudar a data, e documentos com versões
 * diferentes exibiam a mesma vigência. Derivando, nunca desencontra.
 */
export function vigenciaDe(versao: string): string {
  const [ano, mes, dia] = versao.split('-').map(Number)
  if (!ano || !mes || !dia) return versao
  const MESES = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ]
  return `${dia} de ${MESES[mes - 1]} de ${ano}`
}

/**
 * Números de fidelidade — estes SÃO constantes no código da API
 * (`apps/api/src/loyalty/loyalty.service.ts`), então copiar aqui é seguro:
 * mudar um exige deploy, e o diff passa por revisão.
 *
 * As TAXAS (entrega, comissão, teto) NÃO moram aqui de propósito — são editáveis
 * pelo admin em `platform_settings` e vêm da API por `buscarPrecos()`.
 */
export const REGRAS = {
  pontosPorReal: 1,
  pontosParaDesconto: 100,
  descontoPorLote: 10,
  bonusIndicacao: 50,
} as const

export type Precos = {
  deliveryBaseFee: number
  deliveryPerKm: number
  deliveryMinFee: number
  courierBaseFee: number
  courierPerKm: number
  platformCommissionPct: number
  maxDeliveryValue: number
}

/**
 * Fallback usado quando a API não responde. São os valores vigentes em 06/10/2026
 * — ficam aqui só pra página legal nunca renderizar em branco, e o texto avisa
 * que a tabela pode estar desatualizada quando este caminho é usado.
 */
export const PRECOS_FALLBACK: Precos = {
  deliveryBaseFee: 6,
  deliveryPerKm: 1,
  deliveryMinFee: 6,
  courierBaseFee: 5.5,
  courierPerKm: 1,
  platformCommissionPct: 10,
  maxDeliveryValue: 1000,
}

/**
 * Preços vigentes, lidos do mesmo lugar que a API cobra (`GET /config/pricing`).
 *
 * Roda no servidor, na renderização da página legal. `revalidate` de 1h: a config
 * muda raramente e não vale bater na API a cada visita, mas também não dá pra
 * cachear pra sempre — é número de contrato.
 */
export async function buscarPrecos(): Promise<{ precos: Precos; aoVivo: boolean }> {
  try {
    const res = await fetch(`${BASE}/config/pricing`, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as Partial<Precos>
    // Só aceita se vier número em tudo — resposta parcial renderizaria "R$ undefined".
    const completo = (Object.keys(PRECOS_FALLBACK) as (keyof Precos)[]).every(
      (k) => typeof data[k] === 'number' && Number.isFinite(data[k]),
    )
    if (!completo) throw new Error('resposta incompleta')
    return { precos: data as Precos, aoVivo: true }
  } catch {
    return { precos: PRECOS_FALLBACK, aoVivo: false }
  }
}

/** `6` → `R$ 6,00`; `1.5` → `R$ 1,50`. */
export function brl(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Fallback visível quando um dado institucional ainda não foi preenchido. */
export function pendente(valor: string, rotulo: string): string {
  return valor.trim() || `[${rotulo} a preencher]`
}
