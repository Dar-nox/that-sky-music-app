import type { GridCol, GridRow } from '@shared/song'

/** Fixed tap length for community-sheet notes, which never encode duration/sustain
 * (CLAUDE.md §5 import-compatibility note: "default each note to a short tap ... unless
 * the source format explicitly encodes a longer/held note"). Matches the tap length used
 * by the MIDI conversion path (`src/main/midi/convert.ts`) for consistency. */
export const DEFAULT_TAP_DURATION_MS = 150

const GRID_ROWS: GridRow[] = ['A', 'B', 'C']

/**
 * Maps a flat 0-14 key index onto the 3x5 grid, row-major (0-4 = row A, 5-9 = row B,
 * 10-14 = row C). This mirrors `degreeToGridPosition` in `src/main/midi/quantize.ts` so
 * both import paths agree on which physical row is the lowest octave -- see CLAUDE.md
 * §2/§12's [VERIFY] note: that orientation is a documented assumption, not yet confirmed
 * against a live in-game screenshot.
 */
export function keyIndexToGridPosition(index: number): { row: GridRow; col: GridCol } | null {
  if (!Number.isInteger(index) || index < 0 || index > 14) return null
  const rowIndex = Math.floor(index / 5)
  const col = ((index % 5) + 1) as GridCol
  return { row: GRID_ROWS[rowIndex], col }
}

/** Matches note-key strings used across the sky-music/Sky Studio ecosystem, e.g.
 * "1Key0".."1Key14", "0Key3", or a bare "Key7". The leading digits (if any) identify an
 * instrument/voice "layer" in multi-instrument recordings -- irrelevant to us since we
 * only ever target a single 15-key grid, so it's parsed but otherwise discarded. */
export const NOTE_KEY_RE = /^(\d*)key(\d{1,2})$/i

export function parseNoteKeyString(keyStr: string): number | null {
  const match = NOTE_KEY_RE.exec(keyStr.trim())
  if (!match) return null
  return Number(match[2])
}

/** Picks the first non-empty string among candidates, e.g. for artist/author fallbacks. */
export function firstNonEmptyString(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c.trim()
  }
  return ''
}

export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '')
}
