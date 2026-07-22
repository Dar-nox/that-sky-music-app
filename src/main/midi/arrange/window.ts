import type { MelodyPlacement, WindowMode } from '@shared/arranger'
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

/**
 * In `high` placement, seat this percentile of the melody at (or just below) the window's top
 * cell. A percentile rather than the max keeps one stray high grace note from pushing the whole
 * window up.
 */
const HIGH_PLACEMENT_PERCENTILE = 0.92

/** Cells of headroom left above the seated percentile, for the occasional note that peeks higher. */
const HIGH_PLACEMENT_HEADROOM_DEGREES = 1

/**
 * How far (in scale degrees) a phrase's low notes are allowed to pull the `high`-placement anchor
 * down from its top-seated position. Sky has no per-note volume — `high` placement exists
 * specifically to keep the melody in the loud cells near the top of the window, so a single low
 * passage dragging the anchor back down toward center would undo the whole point. Past this cap,
 * low notes just collide/wrap into the window via the existing nearest-octave folding
 * (`voicing.ts`'s `foldIntoWindow`) instead of relocating the anchor.
 */
const MAX_HIGH_PLACEMENT_DROP_DEGREES = 7

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.round(p * (sortedValues.length - 1))))
  return sortedValues[index]
}

/**
 * Chooses the window that best covers a set of melody degrees, aligned to an octave boundary
 * so grid cell A1 always lands on a tonic.
 *
 * `center` uses the 5th–95th percentile rather than min/max so one stray grace note can't drag
 * the whole window off the tune, and centers that span in the window.
 *
 * `high` seats the melody's upper register near the top cell instead (see `MelodyPlacement`),
 * bounded by `MAX_HIGH_PLACEMENT_DROP_DEGREES` so a brief low dip can't drag the anchor back
 * toward center and undo the point of the mode.
 */
function anchorFor(degrees: number[], placement: MelodyPlacement): number {
  const sorted = [...degrees].sort((a, b) => a - b)
  const low = percentile(sorted, 0.05)

  if (placement === 'high') {
    const high = percentile(sorted, HIGH_PLACEMENT_PERCENTILE)
    const topSeated = high - (GRID_DEGREE_SPAN - HIGH_PLACEMENT_HEADROOM_DEGREES)
    const windowStart = Math.max(topSeated - MAX_HIGH_PLACEMENT_DROP_DEGREES, Math.min(low, topSeated))
    return Math.round(windowStart / 7) * 7
  }

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
 *
 * `placement` (default `center`, preserving prior behavior) applies the same way to every
 * anchor computed here, whether it's the single `fixed` window or each per-phrase `adaptive` one.
 */
export function planWindows(
  melody: { timeMs: number; midi: number }[],
  rootPc: number,
  mode: WindowMode,
  placement: MelodyPlacement = 'center'
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
      segments: [
        { startMs: 0, endMs: Infinity, windowStart: anchorFor(degrees.map((d) => d.degree), placement) }
      ],
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
    const ideal = anchorFor(phrase.degrees, placement)
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
