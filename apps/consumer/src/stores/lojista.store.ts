import { create } from 'zustand'

interface LojistaState {
  pendingCount: number
  setPendingCount: (n: number) => void
}

export const useLojistaStore = create<LojistaState>((set) => ({
  pendingCount: 0,
  setPendingCount: (pendingCount) => set({ pendingCount }),
}))
