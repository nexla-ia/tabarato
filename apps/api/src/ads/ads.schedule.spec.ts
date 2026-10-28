import { DIA_MS, proximaJanela } from './ads.schedule'

const agora = new Date('2026-11-01T12:00:00Z')
const em = (dias: number) => new Date(agora.getTime() + dias * DIA_MS)
const janela = (de: number, ate: number) => ({ startsAt: em(de), endsAt: em(ate) })

describe('proximaJanela', () => {
  it('sem anúncios, começa agora e dura os dias contratados', () => {
    const j = proximaJanela(agora, 7, 5, [])
    expect(j.startsAt).toEqual(agora)
    expect(j.endsAt).toEqual(em(7))
  })

  it('com vaga sobrando, começa agora', () => {
    const j = proximaJanela(agora, 7, 2, [janela(-1, 10)])
    expect(j.startsAt).toEqual(agora)
  })

  it('com tudo ocupado, começa quando a primeira vaga abre', () => {
    const j = proximaJanela(agora, 7, 2, [janela(-1, 3), janela(-2, 5)])
    expect(j.startsAt).toEqual(em(3))
    expect(j.endsAt).toEqual(em(10))
  })

  it('não entra se faltar vaga no meio do período', () => {
    // 1 vaga: livre agora, mas outro anúncio já agendado começa no dia 2.
    const j = proximaJanela(agora, 7, 1, [janela(2, 9)])
    expect(j.startsAt).toEqual(em(9))
  })

  it('cabe num buraco do tamanho certo', () => {
    const j = proximaJanela(agora, 3, 1, [janela(-1, 2), janela(5, 12)])
    expect(j.startsAt).toEqual(em(2))
    expect(j.endsAt).toEqual(em(5))
  })

  it('ignora anúncios que já terminaram', () => {
    const j = proximaJanela(agora, 7, 1, [janela(-10, -3)])
    expect(j.startsAt).toEqual(agora)
  })
})
