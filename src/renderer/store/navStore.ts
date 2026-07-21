import { create } from 'zustand'

export type AppPage = 'convert' | 'arranger' | 'play' | 'settings'

interface NavState {
  page: AppPage
  setPage: (page: AppPage) => void
}

export const useNavStore = create<NavState>((set) => ({
  page: 'convert',
  setPage: (page) => set({ page })
}))
