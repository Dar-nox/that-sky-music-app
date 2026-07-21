import { describe, expect, it } from 'vitest'
import type { ParsedMidiNote } from '@shared/midi'
import { assignVoiceRoles } from './voices'
import { placeAndReduce } from './voicing'

function note(midi: number, timeMs = 0, durationMs = 200): ParsedMidiNote {
  return { midi, timeMs, durationMs, velocity: 0.8 }
}

/** Places one chord in C major with the window anchored at degree 0 (C4 = degree 0). */
function place(midis: number[], maxChordNotes = 4) {
  const roled = assignVoiceRoles([{ timeMs: 0, notes: midis.map((m) => note(m)) }])
  return placeAndReduce(roled, 0, () => 0, maxChordNotes)
}

describe('placeAndReduce', () => {
  it('collapses an octave doubling onto one grid cell', () => {
    // C4 and C5 are the same pitch class an octave apart — after folding into a 2-octave
    // window they can land on the same key, which would be a wasted simultaneous press.
    const result = place([60, 72])

    const cells = result.events[0].notes.map((n) => `${n.row}${n.col}`)
    expect(new Set(cells).size).toBe(cells.length)
  })

  it('never emits the same cell twice in one chord', () => {
    const result = place([48, 60, 72, 84], 5)

    const cells = result.events[0].notes.map((n) => `${n.row}${n.col}`)
    expect(new Set(cells).size).toBe(cells.length)
    expect(result.gridCollisionsMerged).toBeGreaterThan(0)
  })

  it('caps a dense chord at maxChordNotes, keeping melody and bass', () => {
    // Six adjacent scale degrees, so all six occupy distinct grid cells and the reduction
    // has to come from the cap rather than from collision-dedupe.
    const result = place([60, 62, 64, 65, 67, 69], 4)

    const kept = result.events[0].notes
    expect(kept).toHaveLength(4)
    expect(kept.some((n) => n.role === 'melody')).toBe(true)
    expect(kept.some((n) => n.role === 'bass')).toBe(true)
    expect(result.voicingReduced).toBeGreaterThan(0)
  })

  it('keeps the third of the chord over redundant inner voices', () => {
    // C major triad with the fifth doubled: the E (the third) defines the quality and must survive.
    const result = place([48, 55, 64, 67], 3)

    const bass = result.events[0].notes.find((n) => n.role === 'bass')
    expect(bass).toBeDefined()
    const intervals = result.events[0].notes.map(
      (n) => (((n.relativeDegree - bass!.relativeDegree) % 7) + 7) % 7
    )
    expect(intervals).toContain(2)
  })

  it('places the bass below the melody rather than merely at the nearest octave', () => {
    // A wide voicing whose bass would fold above the tune under nearest-octave placement.
    const result = place([36, 79], 4)

    const melody = result.events[0].notes.find((n) => n.role === 'melody')!
    const bass = result.events[0].notes.find((n) => n.role === 'bass')!
    expect(bass.relativeDegree).toBeLessThan(melody.relativeDegree)
  })

  it('always keeps every note inside the 15-key grid', () => {
    const result = place([24, 36, 48, 60, 72, 84, 96, 108], 5)

    for (const note of result.events[0].notes) {
      expect(note.relativeDegree).toBeGreaterThanOrEqual(0)
      expect(note.relativeDegree).toBeLessThanOrEqual(14)
      expect(['A', 'B', 'C']).toContain(note.row)
      expect(note.col).toBeGreaterThanOrEqual(1)
      expect(note.col).toBeLessThanOrEqual(5)
    }
  })
})
