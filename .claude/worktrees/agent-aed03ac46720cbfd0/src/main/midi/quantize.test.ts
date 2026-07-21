import { describe, expect, it } from 'vitest'
import { quantizeNotes } from './quantize'

describe('quantizeNotes', () => {
  it('maps an in-key run of notes to sequential, unaltered grid positions', () => {
    // C4..G4 — all diatonic in C major. The window is centered on the run's median
    // degree, so the exact row/col depends on that center, not a fixed row A start.
    const notes = [60, 62, 64, 65, 67].map((midi, i) => ({ midi, timeMs: i * 200 }))
    const result = quantizeNotes(notes, 0, 'shift')

    expect(result.every((n) => !n.altered && !n.dropped)).toBe(true)

    const positions = result.map((n) => n.position)
    const flatIndex = positions.map((p) => ({ A: 0, B: 5, C: 10 })[p!.row] + p!.col - 1)
    // Each successive diatonic step should land exactly one key further along the grid.
    for (let i = 1; i < flatIndex.length; i++) {
      expect(flatIndex[i]).toBe(flatIndex[i - 1] + 1)
    }
  })

  it('flags a chromatic (out-of-scale) note as altered', () => {
    const notes = [60, 61, 64].map((midi, i) => ({ midi, timeMs: i * 200 }))
    const result = quantizeNotes(notes, 0, 'shift')

    expect(result[0].altered).toBe(false)
    expect(result[1].altered).toBe(true) // C#4 has no diatonic home in C major
    expect(result[2].altered).toBe(false)
  })

  it('octave-shifts a note far outside the 15-key window to fit, in shift mode', () => {
    const notes = [60, 96].map((midi, i) => ({ midi, timeMs: i * 200 })) // C4 and C7, 3 octaves apart
    const result = quantizeNotes(notes, 0, 'shift')

    expect(result.every((n) => !n.dropped && n.position !== null)).toBe(true)
    // The window centers near the pair's median, so at least one of the two — the one
    // further from that center — must be pulled in by a whole-octave shift.
    expect(result.some((n) => n.altered)).toBe(true)
  })

  it('drops a note far outside the window when outOfRangeMode is "drop"', () => {
    const notes = [60, 0].map((midi, i) => ({ midi, timeMs: i * 200 })) // C4 and an extreme low note
    const result = quantizeNotes(notes, 0, 'drop')

    expect(result[0].dropped).toBe(false)
    expect(result[1].dropped).toBe(true)
    expect(result[1].position).toBeNull()
  })

  it('clamps a note far outside the window to an edge instead of dropping it', () => {
    const notes = [60, 0].map((midi, i) => ({ midi, timeMs: i * 200 }))
    const result = quantizeNotes(notes, 0, 'clamp')

    expect(result[1].dropped).toBe(false)
    expect(result[1].position).not.toBeNull()
    expect(result[1].altered).toBe(true)
  })

  it('returns an empty array for no input notes', () => {
    expect(quantizeNotes([], 0, 'shift')).toEqual([])
  })
})
