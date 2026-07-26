import { create } from 'zustand'
import type { BackgroundQuality } from '@shared/settings'

interface AppearanceState {
  backgroundQuality: BackgroundQuality
  setBackgroundQuality: (quality: BackgroundQuality) => void
}

/**
 * Mirrors the persisted `backgroundQuality` setting so the Settings page can
 * change the backdrop live, without the shell re-reading settings over IPC.
 *
 * The initial value is the cheap one on purpose: the first paint happens before
 * `getSettings()` resolves, and it must never be the expensive rendering.
 */
export const useAppearanceStore = create<AppearanceState>((set) => ({
  backgroundQuality: 'still',
  setBackgroundQuality: (backgroundQuality) => set({ backgroundQuality })
}))
