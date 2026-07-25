import { describe, expect, it } from 'vitest'
import { planKeySegments, keySegmentAt, type KeySegmentPlan } from './keySegment'
import type { TimedKeyCandidateNote } from './keySegment'

/** Cycles through `pattern` (pitch classes, 0-11) as notes every `stepMs`, from `startMs`
 * (inclusive) to `endMs` (exclusive). Durations are uniform and long enough that duration-
 * weighting doesn't skew the intended pitch-class proportions. */
function notesFromPattern(
  pattern: number[],
  startMs: number,
  endMs: number,
  stepMs = 250,
  durationMs = 240
): TimedKeyCandidateNote[] {
  const notes: TimedKeyCandidateNote[] = []
  let t = startMs
  let i = 0
  while (t < endMs) {
    notes.push({ midi: 60 + pattern[i % pattern.length], timeMs: t, durationMs })
    t += stepMs
    i++
  }
  return notes
}

const C_MAJOR_PCS = [0, 2, 4, 5, 7, 9, 11]
const DB_MAJOR_PCS = [1, 3, 5, 6, 8, 10, 0]

describe('planKeySegments', () => {
  it('detects a clean single modulation, boundary at the switch point', () => {
    const notes = [...notesFromPattern(C_MAJOR_PCS, 0, 20000), ...notesFromPattern(DB_MAJOR_PCS, 20000, 40000)]

    const plan = planKeySegments(notes, 0)

    expect(plan.keyChanges).toBe(1)
    expect(plan.segments).toHaveLength(2)
    expect(plan.segments[0].rootPc).toBe(0)
    expect(plan.segments[1].rootPc).toBe(1)
    // Committed at the FIRST confirming chunk, not the last, so the fix engages as early as
    // reasonably detectable rather than after the damage has already accumulated.
    expect(plan.segments[1].startMs).toBe(20000)
  })

  it('reproduces the Hopes-and-Dreams-shaped magnitude (a merely-okay active key, a dramatically better alternate)', () => {
    // Second phase: 4 notes diatonic to both C and A (the active key), 6 notes diatonic only to
    // A — active(C) fit 40%, alternate(A) fit 100%, the same kind of large, sustained gap as the
    // real song's documented ~33%/92% cliff (dev-exports/findings.md). A 10-note cycle (an exact
    // divisor of the 20-note/5s chunk) keeps every chunk's composition identical, so the winning
    // alternate key doesn't flicker between chunks purely from phase alignment.
    const secondPhasePattern = [2, 4, 9, 11, 1, 6, 8, 1, 6, 8]
    const notes = [
      ...notesFromPattern(C_MAJOR_PCS, 0, 20000),
      ...notesFromPattern(secondPhasePattern, 20000, 45000)
    ]

    const plan = planKeySegments(notes, 0)

    expect(plan.keyChanges).toBe(1)
    expect(plan.segments[1].rootPc).toBe(9) // A major
    expect(plan.segments[1].startMs).toBe(20000)
    expect(plan.segments[1].fitPercent).toBeGreaterThan(85)
  })

  it('does not fragment a uniformly chromatic-but-stable song (no cliff anywhere)', () => {
    // 3 diatonic notes + 1 chromatic passing tone, repeated throughout — a flat ~75% fit the
    // whole way through, shaped like Liebesleid/Merry-Go-Round/"I Really Want to Stay at Your
    // House" in dev-exports/findings.md. Must produce zero segments.
    const pattern = [0, 4, 7, 1] // C, E, G (diatonic) + C#/Db (chromatic)
    const notes = notesFromPattern(pattern, 0, 40000)

    const plan = planKeySegments(notes, 0)

    expect(plan.keyChanges).toBe(0)
    expect(plan.segments).toHaveLength(1)
  })

  it('ignores a single-chunk fluke surrounded by stable chunks', () => {
    const notes = [
      ...notesFromPattern(C_MAJOR_PCS, 0, 20000),
      ...notesFromPattern(DB_MAJOR_PCS, 20000, 25000), // one qualifying chunk only
      ...notesFromPattern(C_MAJOR_PCS, 25000, 45000)
    ]

    const plan = planKeySegments(notes, 0)

    expect(plan.keyChanges).toBe(0)
  })

  it('does not switch while the active key is still healthy, even if an alternate scores higher', () => {
    // 7 notes diatonic to both C and G, 3 notes diatonic only to G: active(C) fit 70% (comfortably
    // above the floor), alternate(G) fit 100% — a 30pp gap that would otherwise clear the
    // improvement threshold, but the floor gate must block it since the active key hasn't
    // actually collapsed.
    const pattern = [0, 2, 4, 7, 9, 11, 0, 6, 6, 6]
    const notes = notesFromPattern(pattern, 0, 30000)

    const plan = planKeySegments(notes, 0)

    expect(plan.keyChanges).toBe(0)
  })

  it('holds the cooldown after a switch, delaying how soon a reversal can commit', () => {
    const notes = [
      ...notesFromPattern(C_MAJOR_PCS, 0, 20000),
      ...notesFromPattern(DB_MAJOR_PCS, 20000, 35000), // confirms Db at 20000, cooldown until 40000
      ...notesFromPattern(C_MAJOR_PCS, 35000, 55000) // reversal attempt starts immediately after
    ]

    const plan = planKeySegments(notes, 0)

    expect(plan.keyChanges).toBe(2)
    expect(plan.segments[1].startMs).toBe(20000)
    expect(plan.segments[1].rootPc).toBe(1)
    // The reversal's own confirming streak could only start once the cooldown lifted at 40000,
    // not at 35000 (the first chunk where the reversal's notes actually begin).
    expect(plan.segments[2].startMs).toBe(40000)
    expect(plan.segments[2].rootPc).toBe(0)
  })

  it('returns a usable single-segment plan for an empty note list', () => {
    const plan = planKeySegments([], 3)
    expect(plan.segments).toHaveLength(1)
    expect(plan.segments[0].rootPc).toBe(3)
    expect(plan.keyChanges).toBe(0)
  })
})

describe('keySegmentAt', () => {
  it('returns the segment in effect at a given time', () => {
    const plan: KeySegmentPlan = {
      segments: [
        { startMs: 0, endMs: 20000, rootPc: 0, keyName: 'C', fitPercent: 100 },
        { startMs: 20000, endMs: Infinity, rootPc: 1, keyName: 'Db', fitPercent: 100 }
      ],
      keyChanges: 1,
      chunkTrace: []
    }

    expect(keySegmentAt(plan, 0).rootPc).toBe(0)
    expect(keySegmentAt(plan, 19999).rootPc).toBe(0)
    expect(keySegmentAt(plan, 20000).rootPc).toBe(1)
    expect(keySegmentAt(plan, 999999).rootPc).toBe(1)
  })
})
