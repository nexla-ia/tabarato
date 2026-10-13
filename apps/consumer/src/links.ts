// Páginas legais moram na WEB (fonte única da verdade) — o app só abre no navegador.
// Assim, corrigir os termos não exige publicar uma versão nova do aplicativo.
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://tabaratoapp.com.br'

export const TERMS_URL = `${WEB_URL}/termos`
export const PRIVACY_URL = `${WEB_URL}/privacidade`
/** Anexo dos Termos só para quem vende — regras de repasse, saque e sanções. */
export const STORE_TERMS_URL = `${WEB_URL}/termos/lojista`

/**
 * Versão dos Termos do Lojista enviada no aceite do cadastro — tem que casar com
 * TERMOS_LOJISTA_VERSAO em apps/web/src/lib/legal.ts, que é quem publica o texto.
 */
export const STORE_TERMS_VERSION = '2026-10-06'
