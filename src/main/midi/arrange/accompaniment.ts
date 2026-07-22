import type { AccompanimentMode } from '@shared/arranger'
import type { PlacedChordEvent } from './voicing'

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
  /** Accompaniment notes removed by the mode filter. */
  densityThinned: number
  /** Accompaniment notes removed for crowding the melody's register. */
  registerSuppressed: number
}

/**
 * Decides how much accompaniment actually sounds under the melody.
 *
 * Two filters, in order:
 *  1. **Mode** — `none` strips accompaniment entirely (clean monophonic melody), `bass` keeps
 *     only the bass voice, `full` keeps the voicing as reduced by `maxChordNotes`.
 *  2. **Register separation** — accompaniment must sit at least MIN_MELODY_SEPARATION_DEGREES
 *     below the melody note. When the melody is already near the bottom of the window there is
 *     simply no room underneath, and the honest answer is to play less.
 *
 * Both are pitch/voicing decisions, not timing ones — an accompaniment note that survives both
 * filters plays at its own real recorded time. The melody itself is never touched by any of this.
 */
export function selectAccompaniment(events: PlacedChordEvent[], mode: AccompanimentMode): AccompanimentResult {
  let densityThinned = 0
  let registerSuppressed = 0

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

    return { timeMs: event.timeMs, notes: [...melody, ...accompaniment] }
  })

  return { events: out, densityThinned, registerSuppressed }
}
