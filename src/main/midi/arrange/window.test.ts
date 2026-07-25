import { describe, expect, it } from 'vitest'
import { planWindows, windowStartAt } from './window'

describe('planWindows', () => {
  it('keeps a single window through a continuous phrase', () => {
    // A stepwise C-major run with no gaps — nothing here should move the window.
    const melody = [60, 62, 64, 65, 67, 69, 71, 72].map((midi, i) => ({ timeMs: i * 200, midi }))

    const plan = planWindows(melody, 0, 'adaptive')

    expect(plan.windowShifts).toBe(0)
    expect(plan.segments).toHaveLength(1)
  })

  it('re-anchors after a phrase boundary when the register jumps an octave', () => {
    const lowPhrase = [48, 50, 52, 53].map((midi, i) => ({ timeMs: i * 200, midi }))
    // 1s of silence, then the same shape two octaves higher, repeated across two consecutive
    // phrases — a single differing phrase is no longer enough to re-anchor on its own (see
    // CONFIRM_PHRASES).
    const highPhrase1 = [72, 74, 76, 77].map((midi, i) => ({ timeMs: 1800 + i * 200, midi }))
    const highPhrase2 = [72, 74, 76, 77].map((midi, i) => ({ timeMs: 3100 + i * 200, midi }))

    const plan = planWindows([...lowPhrase, ...highPhrase1, ...highPhrase2], 0, 'adaptive')

    expect(plan.windowShifts).toBe(1)
    expect(plan.segments).toHaveLength(2)
    // Boundary lands at the FIRST confirming phrase's start, not the second (confirming) one.
    expect(plan.segments[1].startMs).toBe(1800)
    expect(plan.segments[1].windowStart).toBeGreaterThan(plan.segments[0].windowStart)
  })

  it('does not re-anchor for drift smaller than an octave', () => {
    const first = [60, 62, 64].map((midi, i) => ({ timeMs: i * 200, midi }))
    const second = [64, 65, 67].map((midi, i) => ({ timeMs: 1500 + i * 200, midi }))

    expect(planWindows([...first, ...second], 0, 'adaptive').windowShifts).toBe(0)
  })

  it('never shifts in fixed mode, even across an octave jump', () => {
    const melody = [
      ...[48, 50, 52].map((midi, i) => ({ timeMs: i * 200, midi })),
      ...[72, 74, 76].map((midi, i) => ({ timeMs: 2000 + i * 200, midi }))
    ]

    const plan = planWindows(melody, 0, 'fixed')

    expect(plan.windowShifts).toBe(0)
    expect(plan.segments).toHaveLength(1)
  })

  it('ignores a stray outlier note when anchoring', () => {
    const melody = [
      ...Array.from({ length: 20 }, (_, i) => ({ timeMs: i * 100, midi: 60 + (i % 5) })),
      { timeMs: 2000, midi: 108 } // one extreme grace note
    ]
    const baseline = planWindows(
      melody.slice(0, 20),
      0,
      'adaptive'
    )

    expect(planWindows(melody, 0, 'adaptive').segments[0].windowStart).toBe(
      baseline.segments[0].windowStart
    )
  })

  it('returns a usable plan for an empty melody', () => {
    const plan = planWindows([], 0, 'adaptive')
    expect(plan.segments).toHaveLength(1)
    expect(windowStartAt(plan, 5000)).toBe(0)
  })

  it('handles a sparse, gappy melody line without assuming dense coverage', () => {
    // What melodyLine() now actually produces once a real melody-track rest correctly excludes
    // an instant, instead of always having an entry: isolated onsets separated by real silence.
    const melody = [
      { timeMs: 0, midi: 60 },
      { timeMs: 250, midi: 64 },
      { timeMs: 2000, midi: 67 },
      { timeMs: 5000, midi: 62 }
    ]

    expect(() => planWindows(melody, 0, 'adaptive')).not.toThrow()
    expect(planWindows(melody, 0, 'adaptive').segments.length).toBeGreaterThan(0)
  })
})

describe('responsiveWindowing (experimental)', () => {
  /** A continuous (no silence gap >600ms), wide melody: low register, then high register, with
   * no rest anywhere — the pathological case `responsiveWindowing` targets. */
  function wideContinuousPassage(): { timeMs: number; midi: number }[] {
    const lowPhase = Array.from({ length: 50 }, (_, i) => ({ timeMs: i * 200, midi: [48, 50, 52][i % 3] }))
    const highPhase = Array.from({ length: 50 }, (_, i) => ({
      timeMs: 10000 + i * 200,
      midi: [84, 86, 88][i % 3]
    }))
    return [...lowPhase, ...highPhase]
  }

  it('leaves a wide continuous phrase as a single window by default (regression)', () => {
    const plan = planWindows(wideContinuousPassage(), 0, 'adaptive')
    expect(plan.windowShifts).toBe(0)
    expect(plan.segments).toHaveLength(1)
  })

  it('re-anchors mid-phrase when enabled, with no silence gap to hide the jump in', () => {
    const melody = wideContinuousPassage()
    const plan = planWindows(melody, 0, 'adaptive', 'center', true)

    expect(plan.segments.length).toBeGreaterThan(1)
    const midPhraseSegment = plan.segments.find((s) => s.startMs > 0 && s.startMs < 20000)
    expect(midPhraseSegment).toBeDefined()
    expect(midPhraseSegment?.reason).toBe('responsive')
  })

  it('spaces consecutive responsive re-anchors by at least the debounce gap', () => {
    // Three registers in one continuous phrase, each far enough apart to want its own re-anchor.
    const phases = [48, 72, 96]
    const melody = phases.flatMap((midi, phaseIndex) =>
      Array.from({ length: 40 }, (_, i) => ({ timeMs: phaseIndex * 8000 + i * 200, midi }))
    )

    const plan = planWindows(melody, 0, 'adaptive', 'center', true)
    const starts = plan.segments.map((s) => s.startMs).sort((a, b) => a - b)
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(1500)
    }
  })
})

describe('forced key-change boundaries', () => {
  it('re-anchors unconditionally at a forced boundary, even with no register drift', () => {
    // Same pitch throughout — the "ideal" anchor is identical before and after, so without the
    // forced-boundary bypass this would never clear MIN_SHIFT_DEGREES and no segment would split.
    const melody = Array.from({ length: 60 }, (_, i) => ({ timeMs: i * 200, midi: 60 }))

    const plan = planWindows(melody, 0, 'adaptive', 'center', false, [5000])

    expect(plan.segments).toHaveLength(2)
    expect(plan.segments[1].startMs).toBe(5000)
    expect(plan.segments[1].reason).toBe('key-change')
  })
})

describe('natural re-anchor confirmation/cooldown', () => {
  const low = (startMs: number): { timeMs: number; midi: number }[] =>
    [48, 50, 52, 53].map((midi, i) => ({ timeMs: startMs + i * 200, midi }))
  const high = (startMs: number): { timeMs: number; midi: number }[] =>
    [72, 74, 76, 77].map((midi, i) => ({ timeMs: startMs + i * 200, midi }))

  it('does not shift for a single-phrase register excursion that reverts next phrase', () => {
    // A single brief high excursion, then back to low — the pattern that produced audible
    // "harsh jumps" in real-song testing (Merry-Go-Round of Life).
    const melody = [...low(0), ...high(1300), ...low(2600)]

    const plan = planWindows(melody, 0, 'adaptive')

    expect(plan.windowShifts).toBe(0)
    expect(plan.segments).toHaveLength(1)
    // The window never actually visited the high register, even transiently.
    expect(windowStartAt(plan, 1500)).toBe(plan.segments[0].windowStart)
  })

  it('adopts a sustained shift once 2 consecutive phrases agree, at the first phrase\'s boundary', () => {
    const melody = [...low(0), ...high(1300), ...high(3100)]

    const plan = planWindows(melody, 0, 'adaptive')

    expect(plan.windowShifts).toBe(1)
    expect(plan.segments).toHaveLength(2)
    expect(plan.segments[1].startMs).toBe(1300) // first confirming phrase, not the second at 3100
  })

  it('cooldown blocks an immediate reversal right after a confirmed shift', () => {
    const melody = [
      ...low(0),
      ...high(1300), ...high(2600), // confirms shift to high at 1300
      ...low(3900), // would want to revert — blocked by cooldown
      ...low(5200), ...low(6500) // confirms revert to low at 5200
    ]

    const plan = planWindows(melody, 0, 'adaptive')

    expect(plan.windowShifts).toBe(2)
    expect(plan.segments).toHaveLength(3)
    expect(plan.segments[1].startMs).toBe(1300)
    expect(plan.segments[2].startMs).toBe(5200) // NOT 3900 — that attempt was discarded by cooldown
  })
})

describe('windowStartAt', () => {
  it('returns the anchor in effect at a given time', () => {
    const plan = {
      segments: [
        { startMs: 0, endMs: 1000, windowStart: 0 },
        { startMs: 1000, endMs: Infinity, windowStart: 7 }
      ],
      windowShifts: 1
    }

    expect(windowStartAt(plan, 0)).toBe(0)
    expect(windowStartAt(plan, 999)).toBe(0)
    expect(windowStartAt(plan, 1000)).toBe(7)
    expect(windowStartAt(plan, 99999)).toBe(7)
  })

  it('gives a sane anchor for a timestamp that falls inside a melody rest', () => {
    const lowPhrase = [48, 50, 52, 53].map((midi, i) => ({ timeMs: i * 200, midi }))
    const highPhrase1 = [72, 74, 76, 77].map((midi, i) => ({ timeMs: 1800 + i * 200, midi }))
    const highPhrase2 = [72, 74, 76, 77].map((midi, i) => ({ timeMs: 3100 + i * 200, midi }))
    const plan = planWindows([...lowPhrase, ...highPhrase1, ...highPhrase2], 0, 'adaptive')

    // An accompaniment-only chord event sounding during the melody's rest (after the low phrase
    // ends at 800ms, before the high phrase's re-anchor takes effect at 1800ms) must still
    // resolve to the still-current window, not the upcoming one or an undefined gap.
    expect(windowStartAt(plan, 1200)).toBe(plan.segments[0].windowStart)
  })
})
