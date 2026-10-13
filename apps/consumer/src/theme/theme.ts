import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type ThemeMode = 'system' | 'light' | 'dark'

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'system',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'tabarato-theme',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)

export const lightColors = {
  primary: '#FF5500',
  primaryDark: '#CC3300',
  primaryLight: '#FFF0EB',
  primaryMid: '#FF7722',
  bg: '#FFFBF7',
  bg2: '#F5F5F5',
  card: '#FFFFFF',
  border: '#F0E8E0',
  text: '#1A0A00',
  textMuted: '#7A5C4A',
  textLight: '#BBA898',
  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#22C55E',
  overlay: 'rgba(0,0,0,0.45)',
}

export const darkColors: typeof lightColors = {
  primary: '#FF6B1A',
  primaryDark: '#CC3300',
  primaryLight: '#2A1500',
  primaryMid: '#FF7722',
  bg: '#111010',
  bg2: '#1C1B1B',
  card: '#1E1D1D',
  border: '#2E2C2C',
  text: '#F5F0EB',
  textMuted: '#9A8880',
  textLight: '#5A4A42',
  danger: '#F87171',
  warning: '#FCD34D',
  success: '#4ADE80',
  overlay: 'rgba(0,0,0,0.65)',
}

export function useTheme() {
  // App TRAVADO no modo claro — o dark ainda não está adaptado (cores/textos
  // ficam apagados). Ignora o tema do sistema de propósito. Quando o dark
  // estiver pronto, é só restaurar a lógica baseada em `mode`/useColorScheme.
  return { isDark: false, colors: lightColors, mode: 'light' as ThemeMode }
}
