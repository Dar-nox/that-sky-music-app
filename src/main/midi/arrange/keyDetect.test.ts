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

  it('prefers the key that covers the most sounding time over the more "tonal" one', () => {
    // An F-major melody over a long held C bass. Profile correlation alone hears the pedal as
    // a tonic and picks C, which fits 97% of the music; F fits all of it. The missing 3% is
    // every Bb in the tune getting snapped to B natural.
    const notes = [
      { midi: 36, durationMs: 8000 },
      { midi: 36, durationMs: 8000 },
      ...[65, 67, 69, 70, 72, 70, 69, 67, 65].map((midi) => ({ midi, durationMs: 300 }))
    ]

    const result = detectKey(notes)

    expect(result.keyName).toBe('F')
    expect(result.fitPercent).toBe(100)
  })

  it('uses tonal weighting only to break ties between equally well-fitting keys', () => {
    // G-A-B-C-D sits inside both C major and G major, so coverage cannot separate them.
    // Emphasising G as tonic should settle it on G.
    const notes = [
      { midi: 67, durationMs: 4000 },
      { midi: 74, durationMs: 2000 },
      { midi: 71, durationMs: 1500 },
      { midi: 69, durationMs: 400 },
      { midi: 72, durationMs: 400 }
    ]

    const result = detectKey(notes)

    expect(result.fitPercent).toBe(100)
    expect(result.keyName).toBe('G')
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
