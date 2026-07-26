import { create } from 'zustand'
import type { GridCol, GridRow } from '@shared/song'

const LOG_LINES = 30

interface PlaybackUiState {
  /** Cell ids (`"A1"`) currently held down. */
  activeCells: Set<string>
  noteLog: string[]
  noteEvent: (kind: 'down' | 'up', row: GridRow, col: GridCol, timeMs: number) => void
  /** Release every cell without touching the log — used when playback stops. */
  releaseAll: () => void
  /** Full reset, for loading a different song. */
  reset: () => void
}

/**
 * Live playback state, kept out of the Play Music Mode page component.
 *
 * The scheduler emits a note event roughly twenty times a second. While these
 * two values lived in the page's `useState`, every one of those events
 * re-rendered the library index, the transport, the tempo controls and the
 * whole report alongside the fifteen cells that actually changed. Isolating
 * them here means a note event repaints the grid and the log and nothing else.
 */
export const usePlaybackStore = create<PlaybackUiState>((set) => ({
  activeCells: new Set(),
  noteLog: [],

  noteEvent: (kind, row, col, timeMs) =>
    set((state) => {
      const cellId = `${row}${col}`
      const activeCells = new Set(state.activeCells)
      if (kind === 'down') activeCells.add(cellId)
      else activeCells.delete(cellId)

      return {
        activeCells,
        noteLog: [...state.noteLog.slice(-(LOG_LINES - 1)), `${kind} ${cellId} @ ${Math.round(timeMs)}ms`]
      }
    }),

  releaseAll: () => set({ activeCells: new Set() }),

  reset: () => set({ activeCells: new Set(), noteLog: [] })
}))
