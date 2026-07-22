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
    // 1s of silence, then the same shape two octaves higher.
    const highPhrase = [72, 74, 76, 77].map((midi, i) => ({ timeMs: 1800 + i * 200, midi }))

    const plan = planWindows([...lowPhrase, ...highPhrase], 0, 'adaptive')

    expect(plan.windowShifts).toBe(1)
    expect(plan.segments).toHaveLength(2)
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
    const highPhrase = [72, 74, 76, 77].map((midi, i) => ({ timeMs: 1800 + i * 200, midi }))
    const plan = planWindows([...lowPhrase, ...highPhrase], 0, 'adaptive')

    // An accompaniment-only chord event sounding during the melody's rest (after the low phrase
    // ends at 800ms, before the high phrase's re-anchor takes effect at 1800ms) must still
    // resolve to the still-current window, not the upcoming one or an undefined gap.
    expect(windowStartAt(plan, 1200)).toBe(plan.segments[0].windowStart)
  })
})
