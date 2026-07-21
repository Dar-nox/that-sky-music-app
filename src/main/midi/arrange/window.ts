import type { WindowMode } from '@shared/arranger'
import { GRID_DEGREE_SPAN, nearestDiatonicDegree } from '../quantize'

/** A stretch of the song that shares one 15-degree playable window. */
export interface WindowSegment {
  startMs: number
  /** Exclusive; `Infinity` for the final segment. */
  endMs: number
  /** Global scale degree that maps to grid cell A1 for this stretch. */
  windowStart: number
}

export interface WindowPlan {
  segments: WindowSegment[]
  /** How many times the window actually moved (segments beyond the first with a new anchor). */
  windowShifts: number
}

/** A silence at least this long counts as a phrase boundary — a safe place to move the window. */
const PHRASE_GAP_MS = 600

/**
 * Only re-anchor when the melody has genuinely moved register. A full octave of drift is the
 * threshold: below that, shifting would relocate the tune for no benefit.
 */
const MIN_SHIFT_DEGREES = 7

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.round(p * (sortedValues.length - 1))))
  return sortedValues[index]
}

/**
 * Chooses the window that best covers a set of melody degrees, aligned to an octave boundary
 * so grid cell A1 always lands on a tonic. Uses the 5th–95th percentile rather than min/max so
 * one stray grace note can't drag the whole window off the tune.
 */
function anchorFor(degrees: number[]): number {
  const sorted = [...degrees].sort((a, b) => a - b)
  const low = percentile(sorted, 0.05)
  const high = percentile(sorted, 0.95)
  const center = (low + high) / 2
  return Math.round((center - GRID_DEGREE_SPAN / 2) / 7) * 7
}

/**
 * Plans which 15-degree slice of the scale is playable at each point in the song.
 *
 * The plain converter uses a single window centred on the median of *all* notes for the whole
 * song. Two things go wrong with that: the bass drags the centre down away from the melody, and
 * a song whose register drifts (low verse, high chorus) has entire sections force-shifted by an
 * octave — the shift lands mid-phrase, so the tune audibly jumps.
 *
 * This anchors on the melody line only, and in `adaptive` mode re-anchors per phrase, where a
 * phrase is delimited by a silence of at least PHRASE_GAP_MS. Because a re-anchor can only
 * happen across a gap that long, octave changes land in silence where the ear doesn't hear them
 * as a jump. A new anchor is adopted only if it differs from the current one by at least a full
 * octave, so small drift doesn't cause a wobble.
 */
export function planWindows(
  melody: { timeMs: number; midi: number }[],
  rootPc: number,
  mode: WindowMode
): WindowPlan {
  if (melody.length === 0) {
    return { segments: [{ startMs: 0, endMs: Infinity, windowStart: 0 }], windowShifts: 0 }
  }

  const degrees = melody.map((note) => ({
    timeMs: note.timeMs,
    degree: nearestDiatonicDegree(note.midi, rootPc).globalDegree
  }))

  if (mode === 'fixed') {
    return {
      segments: [{ startMs: 0, endMs: Infinity, windowStart: anchorFor(degrees.map((d) => d.degree)) }],
      windowShifts: 0
    }
  }

  // Split the melody at phrase boundaries (a gap of PHRASE_GAP_MS between consecutive onsets).
  const phrases: { startMs: number; lastMs: number; degrees: number[] }[] = []
  for (const entry of degrees) {
    const current = phrases[phrases.length - 1]
    if (!current || entry.timeMs - current.lastMs > PHRASE_GAP_MS) {
      phrases.push({ startMs: entry.timeMs, lastMs: entry.timeMs, degrees: [entry.degree] })
    } else {
      current.degrees.push(entry.degree)
      current.lastMs = entry.timeMs
    }
  }

  // Adopt each phrase's ideal anchor only when it differs by at least a full octave.
  const segments: WindowSegment[] = []
  let windowShifts = 0
  let currentAnchor: number | null = null

  for (const phrase of phrases) {
    const ideal = anchorFor(phrase.degrees)
    if (currentAnchor === null) {
      currentAnchor = ideal
      segments.push({ startMs: 0, endMs: Infinity, windowStart: ideal })
    } else if (Math.abs(ideal - currentAnchor) >= MIN_SHIFT_DEGREES) {
      currentAnchor = ideal
      segments[segments.length - 1].endMs = phrase.startMs
      segments.push({ startMs: phrase.startMs, endMs: Infinity, windowStart: ideal })
      windowShifts++
    }
  }

  return { segments, windowShifts }
}

/** The window anchor in effect at `timeMs`. */
export function windowStartAt(plan: WindowPlan, timeMs: number): number {
  for (let i = plan.segments.length - 1; i >= 0; i--) {
    if (timeMs >= plan.segments[i].startMs) return plan.segments[i].windowStart
  }
  return plan.segments[0].windowStart
}
