import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface ConsumerState {
  activeOrderCount: number
  setActiveOrderCount: (n: number) => void
  lastUsedAddressId: string | null
  setLastUsedAddressId: (id: string | null) => void
}

export const useConsumerStore = create<ConsumerState>()(
  persist(
    (set) => ({
      activeOrderCount: 0,
      setActiveOrderCount: (activeOrderCount) => set({ activeOrderCount }),
      lastUsedAddressId: null,
      setLastUsedAddressId: (lastUsedAddressId) => set({ lastUsedAddressId }),
    }),
    {
      name: 'tabarato-consumer',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ lastUsedAddressId: state.lastUsedAddressId }),
    },
  ),
)
