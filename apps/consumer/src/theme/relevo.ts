import { colors } from './colors'

/**
 * Relevo: o visual "meio 3D" do app. Cada peça tem uma borda inferior mais
 * escura (o "lábio") e uma sombra quente, como se estivesse em cima da tela.
 * Aplique espalhando no estilo: `botao: { ...relevo.botao, borderRadius: 14, ... }`.
 * Botões com lábio afundam ao toque quando usam o componente `Relevo`.
 */

/** Laranja queimado do lábio dos botões principais. */
export const LABIO_LARANJA = '#C2410C'
/** Lábio de cards e superfícies brancas. */
export const LABIO_NEUTRO = '#EADCCD'

export const relevo = {
  /** Botão principal laranja. */
  botao: {
    backgroundColor: colors.primary,
    borderBottomWidth: 4,
    borderBottomColor: LABIO_LARANJA,
    shadowColor: LABIO_LARANJA,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  /** Botão secundário: branco com contorno laranja. */
  contorno: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderBottomWidth: 4,
    borderBottomColor: LABIO_LARANJA,
    shadowColor: '#7A3A10',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  /** Botão neutro (cinza/branco), p.ex. "Cancelar". */
  neutro: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFE4D9',
    borderBottomWidth: 4,
    borderBottomColor: LABIO_NEUTRO,
    shadowColor: '#7A3A10',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  /** Card branco elevado. */
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F3EAE1',
    borderBottomWidth: 3,
    borderBottomColor: LABIO_NEUTRO,
    shadowColor: '#7A3A10',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 5,
  },
  /** Quadradinho de ícone (fundo laranja claro). */
  icone: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: '#FFE0D0',
    borderBottomWidth: 3,
    borderBottomColor: '#FFC4A6',
    shadowColor: '#C2410C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 5,
    elevation: 2,
  },
  /** Chip/filtro ativo (laranja, lábio fino). */
  chipAtivo: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderBottomWidth: 3,
    borderBottomColor: LABIO_LARANJA,
  },
} as const
