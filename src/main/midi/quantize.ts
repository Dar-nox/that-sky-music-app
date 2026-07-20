import type { GridCol, GridRow } from '@shared/song'

export interface GridPosition {
  row: GridRow
  col: GridCol
}

/**
 * Quantizes a chromatic MIDI pitch to the nearest diatonic scale degree of `key`,
 * then maps that degree + octave to a Sky 3x5 grid position. This is the
 * 12-tone -> 7-note step described in CLAUDE.md §5/§6 — the part of the app
 * that actually matters most.
 * TODO(build order step 2): implement quantization + octave shift/drop/clamp.
 */
export function quantizeToGrid(_midiPitch: number, _key: string): GridPosition | null {
  throw new Error('quantizeToGrid is not implemented yet — see CLAUDE.md §6 step 4')
}
