import { describe, expect, it } from 'vitest'
import { detectKey, keyFitPercent } from './keyDetect'

describe('detectKey', () => {
  it('detects the key of a diatonic melody with a high fit', () => {
    // F major scale: F G A Bb C D E F
    const notes = [65, 67, 69, 70, 72, 74, 76, 77].map((midi) => ({ midi, durationMs: 400 }))

    const result = detectKey(notes)

    expect(result.keyName).toBe('F')
    expect(result.fitPercent).toBe(100)
  })

  it('weights by sounding time, not note count', () => {
    // A long C-major tonic triad against a flurry of short out-of-key ornaments. Counting
    // events would let the ornaments win; weighting by duration should not.
    const notes = [
      { midi: 60, durationMs: 4000 },
      { midi: 64, durationMs: 4000 },
      { midi: 67, durationMs: 4000 },
      ...[61, 63, 66, 68, 70].map((midi) => ({ midi, durationMs: 20 }))
    ]

    expect(detectKey(notes).keyName).toBe('C')
  })

  it('reports a low fit for chromatic material', () => {
    const chromatic = Array.from({ length: 12 }, (_, i) => ({ midi: 60 + i, durationMs: 200 }))

    // Any major scale covers only 7 of 12 pitch classes.
    expect(detectKey(chromatic).fitPercent).toBeLessThan(65)
  })

  it('returns a safe default for an empty note list', () => {
    expect(detectKey([])).toEqual({ rootPc: 0, keyName: 'C', fitPercent: 0 })
  })
})

describe('keyFitPercent', () => {
  it('scores a manually chosen key independently of detection', () => {
    const cMajorNotes = [60, 62, 64, 65, 67].map((midi) => ({ midi, durationMs: 200 }))

    expect(keyFitPercent(cMajorNotes, 0)).toBe(100)
    // The same notes measured against F# major, which shares almost nothing with C.
    expect(keyFitPercent(cMajorNotes, 6)).toBeLessThan(50)
  })
})
