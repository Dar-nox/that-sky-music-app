import type { AccompanimentMode } from '@shared/arranger'
import type { PlacedChordEvent, PlacedNote } from './voicing'

/**
 * How far below the melody an accompaniment note has to sit, in scale degrees, to read as
 * harmony rather than as part of the tune.
 *
 * On a 15-cell grid a "chord" voiced right against the melody isn't heard as a chord — it's
 * heard as a smear around the melody note, and it costs cells the melody may need moments
 * later. Two degrees is roughly a third, the smallest gap that still sounds like separate parts.
 */
const MIN_MELODY_SEPARATION_DEGREES = 2

export interface AccompanimentResult {
  events: PlacedChordEvent[]
  /** Accompaniment notes removed by the mode, harmony gating, or the rate cap. */
  densityThinned: number
  /** Accompaniment notes removed for crowding the melody's register. */
  registerSuppressed: number
}

/** The set of grid cells an accompaniment voicing occupies — its identity for change detection. */
function accompanimentSignature(notes: PlacedNote[]): string {
  return [...new Set(notes.map((n) => `${n.row}${n.col}`))].sort().join(',')
}

/**
 * Decides how much accompaniment actually sounds under the melody.
 *
 * Three filters, in order:
 *  1. **Mode** — `none` strips accompaniment entirely (clean monophonic melody), `bass` keeps
 *     only the bass voice, `harmony` and `full` keep the voicing.
 *  2. **Register separation** — accompaniment must sit at least MIN_MELODY_SEPARATION_DEGREES
 *     below the melody note. When the melody is already near the bottom of the window there is
 *     simply no room underneath, and the honest answer is to play less.
 *  3. **Harmony gating + rate cap** (`harmony` mode) — a voicing sounds when the harmony
 *     actually changes, or once per beat if it hasn't; and never faster than the density budget.
 *
 * The melody itself is never touched by any of this.
 */
export function selectAccompaniment(
  events: PlacedChordEvent[],
  mode: AccompanimentMode,
  beatMs: number,
  accompanimentPerSecond: number
): AccompanimentResult {
  let densityThinned = 0
  let registerSuppressed = 0

  let lastSignature: string | null = null
  let lastAccompanimentMs = -Infinity

  const minGapMs = Number.isFinite(accompanimentPerSecond) ? 1000 / accompanimentPerSecond : 0

  const out = events.map((event) => {
    const melody = event.notes.filter((n) => n.role === 'melody')
    let accompaniment = event.notes.filter((n) => n.role !== 'melody')

    if (mode === 'none') {
      densityThinned += accompaniment.length
      return { timeMs: event.timeMs, notes: melody }
    }

    if (mode === 'bass') {
      const before = accompaniment.length
      accompaniment = accompaniment.filter((n) => n.role === 'bass')
      densityThinned += before - accompaniment.length
    }

    const melodyDegree = melody[0]?.relativeDegree
    if (melodyDegree !== undefined && accompaniment.length > 0) {
      const before = accompaniment.length
      accompaniment = accompaniment.filter(
        (n) => melodyDegree - n.relativeDegree >= MIN_MELODY_SEPARATION_DEGREES
      )
      registerSuppressed += before - accompaniment.length
    }

    if (mode === 'harmony' && accompaniment.length > 0) {
      const signature = accompanimentSignature(accompaniment)
      const sinceLast = event.timeMs - lastAccompanimentMs
      const harmonyChanged = signature !== lastSignature
      // A genuinely new chord always gets to sound; an unchanged one re-articulates at most
      // once a beat, which is what keeps a repeated left-hand pattern from flooding the grid.
      if (!harmonyChanged && sinceLast < beatMs) {
        densityThinned += accompaniment.length
        accompaniment = []
      } else {
        lastSignature = signature
      }
    }

    if (accompaniment.length > 0 && minGapMs > 0 && event.timeMs - lastAccompanimentMs < minGapMs) {
      densityThinned += accompaniment.length
      accompaniment = []
    }

    if (accompaniment.length > 0) lastAccompanimentMs = event.timeMs

    return { timeMs: event.timeMs, notes: [...melody, ...accompaniment] }
  })

  return { events: out, densityThinned, registerSuppressed }
}
