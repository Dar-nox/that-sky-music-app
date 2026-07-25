import type { PlacedChordEvent, PlacedNote } from './voicing'
import { isDissonant } from './voicing'
import type { VoiceRole } from './voices'

export interface OverlapResult {
  events: PlacedChordEvent[]
  /** Notes dropped because their real sounding window overlapped an equal-or-higher-priority
   * note a single scale step away — see the priority model in the doc comment below. */
  dissonancesAvoided: number
}

interface Candidate {
  eventIndex: number
  note: PlacedNote
  timeMs: number
  soundingEndMs: number
  dropped: boolean
}

/**
 * A plain tap note's sounding window (see index.ts's TAP_DURATION_MS) is a small, fixed floor
 * that exists purely so the game reliably registers the keypress — it doesn't represent a
 * deliberate musical sustain. A fast passage's notes are routinely closer together than that
 * floor, so two ordinary taps can "overlap" on paper without anything genuinely ringing
 * together. Two *distinct* tap-only notes can never overlap by their full duration (that would
 * require an identical onset, which is already one chord event, handled elsewhere) — so
 * requiring at least one side of a clash to exceed this floor cleanly excludes incidental
 * tap-floor overlap while still catching a real, deliberately sustained note clashing with
 * whatever starts up while it's still ringing. This mirrors the app's tap floor conceptually
 * without importing it, keeping this module's only real dependency on timing the caller-supplied
 * soundingDurationMs.
 */
const MIN_HELD_DURATION_MS = 150

function isGenuinelyHeld(candidate: Candidate): boolean {
  return candidate.soundingEndMs - candidate.timeMs > MIN_HELD_DURATION_MS
}

/**
 * Lower number = more important = never yields to a clashing note ranked at or below it. Melody
 * is the line the ear tracks, so its priority (0) is the minimum possible value — nothing can
 * ever outrank it, which is what makes melody un-droppable by anything except a later melody
 * arrival (see below). Bass anchors the harmony, so it outranks inner filler but still yields to
 * melody.
 */
function rolePriority(role: VoiceRole): number {
  if (role === 'melody') return 0
  if (role === 'bass') return 1
  return 2 // inner
}

/**
 * placeAndReduce already keeps any one PlacedChordEvent internally consonant, because
 * buildChordEvents only groups notes sharing the *exact same* onset timestamp. But a note's real
 * sounding time in-game is a window (a fixed tap, or a real sustain), not an instant, so two notes
 * from two *different* chord events, a scale step apart, routinely still overlap audibly. This is
 * the cross-event counterpart: walk every placed note in time order and drop whichever side of a
 * clash matters less.
 *
 * "Matters less" is a 3-tier role priority (melody > bass > inner), not a binary
 * protected/unprotected split. A candidate is dropped outright if any still-sounding note it
 * clashes with outranks it (strictly lower priority number). Otherwise the candidate survives and
 * retroactively displaces every clashing still-sounding note that doesn't outrank *it* (priority
 * greater than or equal to its own) — including same-role notes, since equal priority is not
 * "less than."
 *
 * That last part is the key thing this model adds: same-role pairs are not exempted from
 * comparison. Sky has no note decay — holding N keys down at once always sounds like an N-note
 * chord, even when all N notes came from one musical voice. A legato melodic run with
 * sustain-held notes routinely leaves 3+ melody notes physically ringing at once; when two of
 * them land a scale step apart, that's a real audible clash, not "ordinary tune motion," and must
 * be resolved the same way any other clash is: drop one side, never touch timing. Under this
 * model the newer arrival always wins a same-role clash (retroactive removal targets priority >=
 * the candidate's own, and same-role means equal priority) — so a run's later notes displace
 * earlier ones still ringing underneath them.
 *
 * Melody is still effectively unkillable by bass/inner: since its priority (0) is the minimum
 * possible value, no active note can ever outrank it, so a melody candidate can never be
 * blocked on arrival. The only way an already-active melody note is ever removed is by a *later
 * melody* arrival's retroactive-displacement step — nothing else has a low enough priority to
 * qualify.
 */
export function avoidOverlapDissonance(
  events: PlacedChordEvent[],
  soundingDurationMs: (note: PlacedNote) => number
): OverlapResult {
  const candidates: Candidate[] = []
  events.forEach((event, eventIndex) => {
    for (const note of event.notes) {
      candidates.push({
        eventIndex,
        note,
        timeMs: event.timeMs,
        soundingEndMs: event.timeMs + soundingDurationMs(note),
        dropped: false
      })
    }
  })

  let active: Candidate[] = []
  let dissonancesAvoided = 0

  for (const candidate of candidates) {
    const now = candidate.timeMs
    // Sounding durations vary per note (a fixed tap vs. a much longer real sustain), so a
    // later-inserted short note can expire before an earlier-inserted long one — active entries
    // are not guaranteed to expire in insertion order, so a full filter is required here rather
    // than shifting off the front.
    active = active.filter((c) => c.soundingEndMs > now)

    const candidatePriority = rolePriority(candidate.note.role)
    const clashing = active.filter(
      (c) =>
        isDissonant(c.note.relativeDegree, candidate.note.relativeDegree) &&
        (isGenuinelyHeld(c) || isGenuinelyHeld(candidate))
    )

    // A still-sounding note that outranks the candidate blocks it outright. Melody's priority (0)
    // is the minimum possible value, so this can never be true for a melody candidate.
    const blockedBy = clashing.some((c) => rolePriority(c.note.role) < candidatePriority)
    if (blockedBy) {
      candidate.dropped = true
      dissonancesAvoided++
      continue
    }

    // Candidate survives, and in turn displaces every clashing active note that doesn't outrank
    // it (priority >= its own) — this covers both "candidate outranks a lower-priority active
    // note" and same-role self-overlap (equal priority is not "less than," so it doesn't block,
    // but it does satisfy >=, so it does get displaced).
    for (const c of clashing) {
      if (rolePriority(c.note.role) >= candidatePriority) {
        c.dropped = true
        dissonancesAvoided++
      }
    }
    active = active.filter((c) => !c.dropped)
    active.push(candidate)
  }

  const notesByEvent: PlacedNote[][] = events.map(() => [])
  for (const candidate of candidates) {
    if (!candidate.dropped) notesByEvent[candidate.eventIndex].push(candidate.note)
  }

  return {
    events: events.map((event, i) => ({ timeMs: event.timeMs, notes: notesByEvent[i] })),
    dissonancesAvoided
  }
}
