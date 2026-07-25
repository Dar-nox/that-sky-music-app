import { majorRootPcToKeyName } from '@shared/midi'
import { keyFitPercent, type KeyCandidateNote } from './keyDetect'

export interface TimedKeyCandidateNote extends KeyCandidateNote {
  timeMs: number
}

/** A stretch of the song that shares one detected key. */
export interface KeySegment {
  startMs: number
  /** Exclusive; `Infinity` for the final segment (same convention as `WindowSegment`). */
  endMs: number
  rootPc: number
  keyName: string
  /** % diatonic fit recomputed over this segment's own full note range, not just the chunks
   * that originally confirmed the switch. */
  fitPercent: number
}

/** One coarse scan chunk's evaluation, kept regardless of whether it moved the needle — the
 * full "why did/didn't this segment happen" trace, surfaced in dev-export diagnostics. */
export interface KeySegmentChunkTrace {
  startMs: number
  endMs: number
  weightMs: number
  /** False when the chunk had too little note-duration to trust its fit numbers. */
  evaluated: boolean
  activeRootPc: number
  activeFitPercent: number
  bestAlternateRootPc: number
  bestAlternateKeyName: string
  bestAlternateFitPercent: number
  /** Consecutive-qualifying-chunk count toward a pending switch as of this chunk (0 if this
   * chunk didn't qualify, wasn't evaluated, or a switch had just committed/cooled down). */
  candidateStreak: number
}

export interface KeySegmentPlan {
  segments: KeySegment[]
  /** Segments beyond the first — how many times the active key actually changed. */
  keyChanges: number
  chunkTrace: KeySegmentChunkTrace[]
}

/**
 * Coarse scan granularity. `findings.md`'s manual analysis used 20s windows and still saw the
 * Hopes-and-Dreams coverage cliff clearly (100% -> 33%); 5s leaves wide margin for earlier,
 * tighter boundary detection while each chunk still carries enough notes for a stable fit number.
 */
const KEY_SEGMENT_CHUNK_MS = 5000

/** A chunk needs at least this much weighted note-duration before its fit numbers are trusted —
 * a near-empty chunk produces a noisy, unrepresentative histogram that could fire a false switch. */
const KEY_SEGMENT_MIN_CHUNK_WEIGHT_MS = 1500

/** The active key's LOCAL fit must already have collapsed to at or below this before a switch is
 * even considered. Every uniformly-chromatic test song (Liebesleid 75%, Merry-Go-Round 76%,
 * "I Really Want to Stay at Your House" 75%) sits comfortably above this floor throughout, with
 * no sharp coverage cliff anywhere — so those songs never reach the "consider switching" gate. */
const KEY_SEGMENT_ACTIVE_FLOOR_PERCENT = 60

/** The best alternate key for a chunk must beat the active key's local fit by at least this many
 * percentage points. Hopes and Dreams' confirmed case is a 59-67pp gap (33% active vs. 92%
 * alternate) — this sits well below that real case while comfortably above the single-digit gaps
 * a merely-chromatic piece's next-best key produces (nothing in those pieces is actually diatonic
 * to a different key, so no alternate ever dramatically outscores the active one). */
const KEY_SEGMENT_MIN_IMPROVEMENT_PERCENT = 20

/** Consecutive qualifying chunks (same alternate key, both gates cleared) required before a
 * switch commits — ~15s of sustained evidence at the default chunk size. One qualifying chunk
 * could be a brief tonicization that resolves back; three in a row is far harder for anything
 * but a genuine, lasting modulation to produce. */
const KEY_SEGMENT_CONFIRM_CHUNKS = 3

/** Once a switch commits, the new key holds for at least this long before another switch can
 * commit — guards against oscillation across an ambiguous transition passage. Deliberately one
 * chunk longer than `KEY_SEGMENT_CONFIRM_CHUNKS * KEY_SEGMENT_CHUNK_MS` (15s): if it were equal,
 * a reversal's own confirmation window would always exactly consume the cooldown and the gate
 * would never actually block anything. Hopes and Dreams' own transition (its ~15s "unlabeled"
 * section between the okay and really-bad verdicts) is still comfortably covered by this floor. */
const KEY_SEGMENT_MIN_SEGMENT_MS = 20000

function bucketIntoChunks(
  notes: TimedKeyCandidateNote[],
  totalSpanMs: number
): { startMs: number; endMs: number; notes: TimedKeyCandidateNote[] }[] {
  const chunkCount = Math.max(1, Math.ceil(totalSpanMs / KEY_SEGMENT_CHUNK_MS))
  const chunks: { startMs: number; endMs: number; notes: TimedKeyCandidateNote[] }[] = Array.from(
    { length: chunkCount },
    (_, i) => ({ startMs: i * KEY_SEGMENT_CHUNK_MS, endMs: (i + 1) * KEY_SEGMENT_CHUNK_MS, notes: [] })
  )
  for (const note of notes) {
    const index = Math.min(chunkCount - 1, Math.floor(note.timeMs / KEY_SEGMENT_CHUNK_MS))
    chunks[index].notes.push(note)
  }
  return chunks
}

function weightOf(notes: TimedKeyCandidateNote[]): number {
  return notes.reduce((sum, n) => sum + Math.max(n.durationMs, 1), 0)
}

/** Best-fitting alternate key for a chunk, excluding `activeRootPc`. */
function bestAlternate(notes: TimedKeyCandidateNote[], activeRootPc: number): { rootPc: number; fitPercent: number } {
  let best = { rootPc: (activeRootPc + 1) % 12, fitPercent: -1 }
  for (let rootPc = 0; rootPc < 12; rootPc++) {
    if (rootPc === activeRootPc) continue
    const fitPercent = keyFitPercent(notes, rootPc)
    if (fitPercent > best.fitPercent) best = { rootPc, fitPercent }
  }
  return best
}

/**
 * Detects a sustained, confident key change partway through a song, instead of forcing the whole
 * piece through one globally-chosen key. Conservative by design (see the constants above) — it
 * should rarely fire on a merely chromatic-but-stable piece, only on a genuine, lasting
 * modulation. `initialRootPc` should be the already-resolved whole-song key (from file metadata
 * or the histogram detector), which seeds segment 0 before any scanning happens.
 */
export function planKeySegments(notes: TimedKeyCandidateNote[], initialRootPc: number): KeySegmentPlan {
  if (notes.length === 0) {
    return {
      segments: [{ startMs: 0, endMs: Infinity, rootPc: initialRootPc, keyName: majorRootPcToKeyName(initialRootPc), fitPercent: 0 }],
      keyChanges: 0,
      chunkTrace: []
    }
  }

  const totalSpanMs = Math.max(...notes.map((n) => n.timeMs)) + 1
  const chunks = bucketIntoChunks(notes, totalSpanMs)

  const boundaries: { startMs: number; rootPc: number }[] = [{ startMs: 0, rootPc: initialRootPc }]
  const chunkTrace: KeySegmentChunkTrace[] = []

  let activeRootPc = initialRootPc
  let streak: { rootPc: number; count: number; firstStartMs: number } | null = null
  let cooldownUntilMs = 0

  for (const chunk of chunks) {
    const weightMs = weightOf(chunk.notes)
    if (weightMs < KEY_SEGMENT_MIN_CHUNK_WEIGHT_MS) {
      chunkTrace.push({
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        weightMs,
        evaluated: false,
        activeRootPc,
        activeFitPercent: 0,
        bestAlternateRootPc: activeRootPc,
        bestAlternateKeyName: majorRootPcToKeyName(activeRootPc),
        bestAlternateFitPercent: 0,
        candidateStreak: 0
      })
      continue
    }

    const activeFitPercent = keyFitPercent(chunk.notes, activeRootPc)
    const alternate = bestAlternate(chunk.notes, activeRootPc)

    const pastCooldown = chunk.startMs >= cooldownUntilMs
    const qualifies =
      pastCooldown &&
      activeFitPercent <= KEY_SEGMENT_ACTIVE_FLOOR_PERCENT &&
      alternate.fitPercent - activeFitPercent >= KEY_SEGMENT_MIN_IMPROVEMENT_PERCENT

    if (qualifies) {
      if (streak && streak.rootPc === alternate.rootPc) {
        streak.count++
      } else {
        streak = { rootPc: alternate.rootPc, count: 1, firstStartMs: chunk.startMs }
      }
    } else {
      streak = null
    }

    chunkTrace.push({
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      weightMs,
      evaluated: true,
      activeRootPc,
      activeFitPercent,
      bestAlternateRootPc: alternate.rootPc,
      bestAlternateKeyName: majorRootPcToKeyName(alternate.rootPc),
      bestAlternateFitPercent: alternate.fitPercent,
      candidateStreak: streak?.count ?? 0
    })

    if (streak && streak.count >= KEY_SEGMENT_CONFIRM_CHUNKS) {
      activeRootPc = streak.rootPc
      boundaries.push({ startMs: streak.firstStartMs, rootPc: activeRootPc })
      cooldownUntilMs = streak.firstStartMs + KEY_SEGMENT_MIN_SEGMENT_MS
      streak = null
    }
  }

  const segments: KeySegment[] = boundaries.map((boundary, i) => {
    const endMs = i + 1 < boundaries.length ? boundaries[i + 1].startMs : Infinity
    const segmentNotes = notes.filter((n) => n.timeMs >= boundary.startMs && n.timeMs < endMs)
    return {
      startMs: boundary.startMs,
      endMs,
      rootPc: boundary.rootPc,
      keyName: majorRootPcToKeyName(boundary.rootPc),
      fitPercent: keyFitPercent(segmentNotes.length > 0 ? segmentNotes : notes, boundary.rootPc)
    }
  })

  return { segments, keyChanges: segments.length - 1, chunkTrace }
}

/** The key segment in effect at `timeMs` — mirrors `window.ts`'s `windowStartAt` lookup. */
export function keySegmentAt(plan: KeySegmentPlan, timeMs: number): KeySegment {
  for (let i = plan.segments.length - 1; i >= 0; i--) {
    if (timeMs >= plan.segments[i].startMs) return plan.segments[i]
  }
  return plan.segments[0]
}
