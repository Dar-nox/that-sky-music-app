import type { MelodyPlacement, WindowMode } from '@shared/arranger'
import { GRID_DEGREE_SPAN, nearestDiatonicDegree, rootPcLookup, type RootPcInput } from '../quantize'

/** A stretch of the song that shares one 15-degree playable window. */
export interface WindowSegment {
  startMs: number
  /** Exclusive; `Infinity` for the final segment. */
  endMs: number
  /** Global scale degree that maps to grid cell A1 for this stretch. */
  windowStart: number
  /** Why this segment's anchor was adopted — diagnostic only, doesn't affect `windowStartAt`. */
  reason?: 'initial' | 'phrase' | 'responsive' | 'key-change'
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
 * A register change must be the "ideal" anchor for this many consecutive phrases before it's
 * actually adopted. Without this, a single stray phrase (one line that briefly reaches higher or
 * lower than the rest of the tune) was enough to relocate the whole window, and the very next
 * phrase reverting was enough to relocate it right back — real songs measured at ~30 such flips,
 * many lasting only 1-3 seconds, heard as harsh, unrecognizable jumps rather than a stable tune.
 * Requiring two phrases in a row to agree filters out any single-phrase excursion entirely, while
 * still letting a genuinely sustained shift (a real key change, a legitimately higher section)
 * through after one extra phrase's delay. Modeled on `keySegment.ts`'s confirm/cooldown gate for
 * the same reason it works there: real, lasting changes tend to repeat; noise doesn't.
 *
 * Known trade-off: a melody that truly alternates registers every single phrase forever would
 * never confirm either direction, freezing the window at whichever anchor came first for the rest
 * of the song. That's an acceptable cost — constant re-anchoring on every phrase would sound far
 * worse than committing to one register.
 */
const CONFIRM_PHRASES = 2

/**
 * Phrases to wait after an adopted shift before a new one can start accumulating confirmations.
 * Confirmation alone still allows a melody hovering right at the boundary to flip every
 * `CONFIRM_PHRASES` phrases forever; this adds a mandatory gap after each real shift so that can't
 * happen. Unlike `keySegment.ts`'s time-based cooldown, this is a phrase-count countdown that
 * starts only once a shift is actually confirmed, so there's no risk of the confirming streak
 * itself eating the cooldown.
 */
const COOLDOWN_PHRASES = 1

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

/**
 * Rolling lookback for experimental mid-phrase re-anchoring (`responsiveWindowing`), ms. Long
 * enough to characterize genuine local register rather than one note, short enough to react well
 * before a long, silence-free wide passage ends (the confirmed motivating case — Toby Fox's
 * "Hopes and Dreams," whose bad-sounding opening spans 45s at 4.67 octaves with no phrase break —
 * runs for over 20 of these lookback windows, so it reacts early, not once the damage is done).
 */
const RESPONSIVE_WINDOW_LOOKBACK_MS = 2000

/** Minimum notes inside the lookback before trusting its percentile-based anchor — avoids an
 * anchor computed from 1-2 points. */
const RESPONSIVE_MIN_LOOKBACK_NOTES = 3

/** Minimum spacing between consecutive re-anchors (of any kind) before another responsive
 * re-anchor can fire. Without this, melody hovering right at the `MIN_SHIFT_DEGREES` boundary
 * could re-anchor on every other note — audibly worse than the wide-range problem it targets. */
const RESPONSIVE_MIN_GAP_FROM_LAST_SHIFT_MS = 1500

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
 * Refines a base window plan by allowing additional re-anchors *within* a silence-free phrase,
 * tracking a rolling lookback of recent melody degrees rather than the whole phrase's aggregate
 * distribution. Only called when `responsiveWindowing` is on.
 *
 * EXPERIMENTAL: today's phrase-boundary re-anchoring only ever moves the window across a silence,
 * where the ear can't hear the jump. A wide, continuous, silence-free passage (no phrase boundary
 * to hide a re-anchor in) currently keeps one anchor for its whole duration no matter how far the
 * melody's local register drifts, which forces heavy independent octave-folding once the true
 * range exceeds the 2-octave window. This trades that artifact for a different, unproven one — an
 * audible register jump mid-line, since nothing here changes note timing to hide it. Whether that
 * trade is actually an improvement can only be judged by ear on real output, not from stats alone.
 *
 * Note: the base segments this receives may now be longer-spanning than before the confirm/cooldown
 * gate on natural re-anchoring was added (a short, unconfirmed excursion that used to get its own
 * segment is now folded into the surrounding stable one), so this pass may see more internal
 * register variation within one base segment than it used to.
 */
function applyResponsiveReanchoring(
  baseSegments: WindowSegment[],
  degrees: { timeMs: number; degree: number }[],
  placement: MelodyPlacement
): { segments: WindowSegment[]; extraShifts: number } {
  const result: WindowSegment[] = []
  let extraShifts = 0

  for (const base of baseSegments) {
    const segmentDegrees = degrees.filter((d) => d.timeMs >= base.startMs && d.timeMs < base.endMs)

    let currentAnchor = base.windowStart
    let segStart = base.startMs
    let segReason = base.reason
    let lastShiftMs = base.startMs

    for (const entry of segmentDegrees) {
      if (entry.timeMs - lastShiftMs < RESPONSIVE_MIN_GAP_FROM_LAST_SHIFT_MS) continue

      const lookback = segmentDegrees
        .filter((d) => d.timeMs <= entry.timeMs && d.timeMs > entry.timeMs - RESPONSIVE_WINDOW_LOOKBACK_MS)
        .map((d) => d.degree)
      if (lookback.length < RESPONSIVE_MIN_LOOKBACK_NOTES) continue

      const candidate = anchorFor(lookback, placement)
      if (Math.abs(candidate - currentAnchor) < MIN_SHIFT_DEGREES) continue

      result.push({ startMs: segStart, endMs: entry.timeMs, windowStart: currentAnchor, reason: segReason })
      segStart = entry.timeMs
      currentAnchor = candidate
      segReason = 'responsive'
      lastShiftMs = entry.timeMs
      extraShifts++
    }

    result.push({ startMs: segStart, endMs: base.endMs, windowStart: currentAnchor, reason: segReason })
  }

  return { segments: result, extraShifts }
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
 * octave, so small drift doesn't cause a wobble — and only once it's been the ideal anchor for
 * `CONFIRM_PHRASES` phrases in a row, with a `COOLDOWN_PHRASES`-phrase gap before the next shift
 * can start accumulating (see those constants) — so a single stray phrase can't relocate the
 * window on its own, only a genuinely sustained register change can.
 *
 * `placement` (default `center`, preserving prior behavior) applies the same way to every
 * anchor computed here, whether it's the single `fixed` window or each per-phrase `adaptive` one.
 *
 * `forcedBoundariesMs` (from key-segment detection, see `keySegment.ts`) splits a phrase even
 * without a silence gap, and its new anchor is adopted unconditionally, bypassing
 * `MIN_SHIFT_DEGREES` — once the tonal reference itself has changed, "does the new anchor differ
 * by less than an octave" isn't a meaningful question, since the old anchor's degree numbers no
 * longer describe the same key.
 *
 * `responsiveWindowing` (default off, experimental) additionally allows re-anchoring within a
 * silence-free phrase — see `applyResponsiveReanchoring`.
 */
export function planWindows(
  melody: { timeMs: number; midi: number }[],
  rootPc: RootPcInput,
  mode: WindowMode,
  placement: MelodyPlacement = 'center',
  responsiveWindowing = false,
  forcedBoundariesMs: number[] = []
): WindowPlan {
  if (melody.length === 0) {
    return { segments: [{ startMs: 0, endMs: Infinity, windowStart: 0, reason: 'initial' }], windowShifts: 0 }
  }

  const rootPcAt = rootPcLookup(rootPc)
  const degrees = melody.map((note) => ({
    timeMs: note.timeMs,
    degree: nearestDiatonicDegree(note.midi, rootPcAt(note.timeMs)).globalDegree
  }))

  if (mode === 'fixed') {
    return {
      segments: [
        {
          startMs: 0,
          endMs: Infinity,
          windowStart: anchorFor(degrees.map((d) => d.degree), placement),
          reason: 'initial'
        }
      ],
      windowShifts: 0
    }
  }

  // Split the melody at phrase boundaries (a silence gap) or a forced key-change boundary.
  const sortedForced = [...forcedBoundariesMs].sort((a, b) => a - b)
  let forcedPtr = 0
  const phrases: { startMs: number; lastMs: number; degrees: number[]; forced: boolean }[] = []
  for (const entry of degrees) {
    const current = phrases[phrases.length - 1]
    let forcedBreak = false
    while (forcedPtr < sortedForced.length && sortedForced[forcedPtr] <= entry.timeMs) {
      if (current && sortedForced[forcedPtr] > current.lastMs) forcedBreak = true
      forcedPtr++
    }
    const silenceBreak = !current || entry.timeMs - current.lastMs > PHRASE_GAP_MS
    if (silenceBreak || forcedBreak) {
      phrases.push({ startMs: entry.timeMs, lastMs: entry.timeMs, degrees: [entry.degree], forced: forcedBreak })
    } else {
      current.degrees.push(entry.degree)
      current.lastMs = entry.timeMs
    }
  }

  // Adopt each phrase's ideal anchor once it differs by at least a full octave AND has been the
  // ideal anchor for CONFIRM_PHRASES consecutive phrases (see that constant's doc comment), or
  // unconditionally when the phrase started at a forced key-change boundary.
  const segments: WindowSegment[] = []
  let windowShifts = 0
  let currentAnchor: number | null = null
  let cooldownRemaining = 0
  let pendingAnchor: number | null = null
  let pendingCount = 0
  let pendingFirstStartMs = 0

  const adopt = (anchor: number, startMs: number, reason: 'phrase' | 'key-change'): void => {
    currentAnchor = anchor
    segments[segments.length - 1].endMs = startMs
    segments.push({ startMs, endMs: Infinity, windowStart: anchor, reason })
    windowShifts++
    pendingAnchor = null
    pendingCount = 0
    cooldownRemaining = COOLDOWN_PHRASES
  }

  for (const phrase of phrases) {
    const ideal = anchorFor(phrase.degrees, placement)

    if (currentAnchor === null) {
      currentAnchor = ideal
      segments.push({ startMs: 0, endMs: Infinity, windowStart: ideal, reason: 'initial' })
      continue
    }

    if (phrase.forced) {
      adopt(ideal, phrase.startMs, 'key-change')
      continue
    }

    if (cooldownRemaining > 0) {
      cooldownRemaining--
      pendingAnchor = null
      pendingCount = 0
      continue
    }

    if (Math.abs(ideal - currentAnchor) < MIN_SHIFT_DEGREES) {
      pendingAnchor = null
      pendingCount = 0
      continue
    }

    if (pendingAnchor === ideal) {
      pendingCount++
    } else {
      pendingAnchor = ideal
      pendingCount = 1
      pendingFirstStartMs = phrase.startMs
    }

    if (pendingCount >= CONFIRM_PHRASES) {
      adopt(ideal, pendingFirstStartMs, 'phrase')
    }
  }

  if (!responsiveWindowing) {
    return { segments, windowShifts }
  }

  const { segments: refined, extraShifts } = applyResponsiveReanchoring(segments, degrees, placement)
  return { segments: refined, windowShifts: windowShifts + extraShifts }
}

/** The window anchor in effect at `timeMs`. */
export function windowStartAt(plan: WindowPlan, timeMs: number): number {
  for (let i = plan.segments.length - 1; i >= 0; i--) {
    if (timeMs >= plan.segments[i].startMs) return plan.segments[i].windowStart
  }
  return plan.segments[0].windowStart
}
