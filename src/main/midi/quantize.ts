import type { GridCol, GridRow } from '@shared/song'
import type { OutOfRangeMode } from '@shared/midi'

export interface GridPosition {
  row: GridRow
  col: GridCol
}

export interface QuantizeInput {
  midi: number
  timeMs: number
}

export interface QuantizedNote extends QuantizeInput {
  position: GridPosition | null
  /** True if the note needed a chromatic snap and/or an octave shift to land on the grid. */
  altered: boolean
  /** True if `outOfRangeMode: 'drop'` and the note couldn't be placed on the grid at all. */
  dropped: boolean
}

export const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11]
const GRID_ROWS: GridRow[] = ['A', 'B', 'C']
/** Scale degrees spanned by the 15-key grid, endpoints inclusive (2 octaves = 2*7 + 1). */
export const GRID_DEGREE_SPAN = 14
/** How far (in octaves) to try shifting a note before falling back to `outOfRangeMode`'s edge-case behavior. */
const MAX_TRY_SHIFT_OCTAVES = 2

/**
 * Snaps one chromatic MIDI pitch to the nearest diatonic degree of the major scale
 * rooted at `rootPc`, returning a *global* scale-degree index (7 per octave, can be
 * negative or span many octaves) plus whether the snap moved the pitch at all.
 */
export function nearestDiatonicDegree(
  midiPitch: number,
  rootPc: number
): { globalDegree: number; altered: boolean } {
  const offset = midiPitch - rootPc
  const octaveIndex = Math.floor(offset / 12)
  const semitoneInOctave = offset - octaveIndex * 12

  let bestIndex = 0
  let bestDistance = Infinity
  for (let i = 0; i < MAJOR_SCALE_STEPS.length; i++) {
    const distance = Math.abs(MAJOR_SCALE_STEPS[i] - semitoneInOctave)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = i
    }
  }

  return {
    globalDegree: octaveIndex * 7 + bestIndex,
    altered: bestDistance !== 0
  }
}

export function degreeToGridPosition(relativeDegree: number): GridPosition {
  const rowIndex = Math.floor(relativeDegree / 5)
  const col = ((relativeDegree % 5) + 1) as GridCol
  // Row A is the lowest octave (community ABC1-5 convention) — CLAUDE.md §2 flags this
  // orientation as [VERIFY] against an in-game screenshot before relying on it further.
  return { row: GRID_ROWS[rowIndex], col }
}

/**
 * Quantizes a batch of MIDI notes (already track-selected) onto the Sky 15-key grid.
 *
 * The 15 keys span exactly 2 octaves of the major scale rooted at `rootPc` (15 = 2*7 + 1
 * scale degrees, endpoints inclusive). Since a song's notes can span far more range than
 * that, this picks one 15-degree window centered on the song's median pitch.
 *
 * `outOfRangeMode` decides what happens to a note that doesn't land in that window at its
 * *natural* octave:
 *   - `shift` — move it by whole octaves until it fits (always succeeds).
 *   - `clamp` — pin it to the nearest edge degree of the window.
 *   - `drop`  — leave it out entirely.
 *
 * The octave search deliberately runs for `shift` only. It used to run unconditionally, which
 * made the setting a no-op: the window is already 2 octaves wide, so searching ±2 octaves
 * around it covered essentially the whole usable MIDI range and the clamp/drop branches were
 * unreachable. (This is a narrower reading of CLAUDE.md §6 step 5's "dropped if they still
 * don't fit after shifting" — taken literally, that phrasing describes a control that can
 * never do anything.)
 *
 * [DECISION] The schema's conversion report only has three buckets (unaltered / octave-
 * shifted / dropped) — it doesn't separately track "chromatic snap only, no octave shift."
 * Any note that needed *either* a chromatic snap or an octave/clamp adjustment is counted
 * as octave-shifted; only an exact, already-in-range hit counts as unaltered.
 */
export function quantizeNotes(notes: QuantizeInput[], rootPc: number, outOfRangeMode: OutOfRangeMode): QuantizedNote[] {
  if (notes.length === 0) return []

  const degrees = notes.map((n) => nearestDiatonicDegree(n.midi, rootPc))
  const sortedGlobalDegrees = [...degrees.map((d) => d.globalDegree)].sort((a, b) => a - b)
  const medianDegree = sortedGlobalDegrees[Math.floor(sortedGlobalDegrees.length / 2)]

  // Center the median inside the 15-wide window, aligned to an octave boundary so
  // "row A col 1" always lands on an actual tonic note.
  const windowStart = Math.round(medianDegree / 7) * 7 - 7
  const windowEnd = windowStart + 14

  return notes.map((note, i) => {
    const { globalDegree, altered: chromaticAltered } = degrees[i]

    // Only 'shift' is allowed to relocate a note by octaves; the other modes get one chance
    // at the note's natural octave before falling through to their own behavior.
    const tryOrder: number[] = [0]
    if (outOfRangeMode === 'shift') {
      for (let k = 1; k <= MAX_TRY_SHIFT_OCTAVES; k++) tryOrder.push(-k, k)
    }

    for (const k of tryOrder) {
      const shifted = globalDegree + 7 * k
      if (shifted >= windowStart && shifted <= windowEnd) {
        return {
          ...note,
          position: degreeToGridPosition(shifted - windowStart),
          altered: chromaticAltered || k !== 0,
          dropped: false
        }
      }
    }

    // Didn't fit within the tried octave range — fall back to the configured mode.
    if (outOfRangeMode === 'drop') {
      return { ...note, position: null, altered: true, dropped: true }
    }

    if (outOfRangeMode === 'clamp') {
      const clamped = globalDegree < windowStart ? windowStart : windowEnd
      return { ...note, position: degreeToGridPosition(clamped - windowStart), altered: true, dropped: false }
    }

    // 'shift': force-shift by whole octaves until it lands in range (always terminates).
    let forced = globalDegree
    while (forced < windowStart) forced += 7
    while (forced > windowEnd) forced -= 7
    return { ...note, position: degreeToGridPosition(forced - windowStart), altered: true, dropped: false }
  })
}
