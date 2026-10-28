/**
 * Agenda das vagas da vitrine. Pura (sem banco) para ser testada à parte.
 *
 * Cada anúncio pago ocupa uma vaga em [startsAt, endsAt). Com `slots` vagas, um
 * anúncio novo começa no primeiro instante >= agora em que sobra vaga durante
 * TODOS os dias contratados — nunca entra no ar para sair no meio por falta de vaga.
 */

export const DIA_MS = 24 * 60 * 60 * 1000

export interface Janela { startsAt: Date; endsAt: Date }

/** Quantas janelas cobrem o instante t. */
function ocupacaoEm(t: number, janelas: Janela[]): number {
  let n = 0
  for (const j of janelas) if (j.startsAt.getTime() <= t && t < j.endsAt.getTime()) n++
  return n
}

/** Maior ocupação dentro de [ini, fim). Só muda onde alguma janela começa. */
function picoEntre(ini: number, fim: number, janelas: Janela[]): number {
  let pico = ocupacaoEm(ini, janelas)
  for (const j of janelas) {
    const s = j.startsAt.getTime()
    if (s > ini && s < fim) pico = Math.max(pico, ocupacaoEm(s, janelas))
  }
  return pico
}

export function proximaJanela(agora: Date, dias: number, slots: number, ocupadas: Janela[]): Janela {
  const duracao = dias * DIA_MS
  const t0 = agora.getTime()
  // Só vale começar agora ou quando alguma vaga se abre.
  const candidatos = [t0, ...ocupadas.map((j) => j.endsAt.getTime()).filter((t) => t > t0)]
    .sort((a, b) => a - b)
  for (const c of candidatos) {
    if (picoEntre(c, c + duracao, ocupadas) < slots) {
      return { startsAt: new Date(c), endsAt: new Date(c + duracao) }
    }
  }
  // Inalcançável com slots >= 1 (depois do último fim tudo está livre), mas
  // garante um retorno se slots vier 0 por configuração errada.
  const fim = Math.max(t0, ...ocupadas.map((j) => j.endsAt.getTime()))
  return { startsAt: new Date(fim), endsAt: new Date(fim + duracao) }
}
