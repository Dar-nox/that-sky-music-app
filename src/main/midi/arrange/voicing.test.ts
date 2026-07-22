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

  it('folds an inner voice below the melody rather than merely at the nearest octave', () => {
    // 79 (melody) folds to relative degree 11. 69, if folded to the nearest octave with no
    // regard for direction, lands at 12 — above the melody, which on a velocity-less instrument
    // reads as more prominent than the tune itself. 36 (the bass) is already direction-aware and
    // correctly folds below both.
    const result = place([79, 69, 36], 4)

    const melody = result.events[0].notes.find((n) => n.role === 'melody')!
    const inner = result.events[0].notes.find((n) => n.role === 'inner')!

    expect(inner.relativeDegree).toBeLessThan(melody.relativeDegree)
  })

  it("keeps the winning note's own duration on a grid collision, not blended with the dropped note's", () => {
    // 48 (bass) and 60 (inner) both fold onto the same below-melody cell once 84 (melody)
    // anchors the window. Bass outranks inner in voicing priority, so 48 wins the collision and
    // its own duration (300ms) must survive untouched — not stretched/blended to the dropped
    // inner note's 900ms.
    const roled = assignVoiceRoles([
      { timeMs: 0, notes: [note(48, 0, 300), note(60, 0, 900), note(84, 0, 200)] }
    ])
    const result = placeAndReduce(roled, 0, () => 0, 4)

    expect(result.gridCollisionsMerged).toBeGreaterThan(0)
    const winner = result.events[0].notes.find((n) => n.role === 'bass')
    expect(winner?.durationMs).toBe(300)
  })

  it('keeps the bass placement stable across chords instead of leaping whenever the melody register shifts', () => {
    // Bass pitch 17 (global degree 10, already inside the window) struck three times in a row,
    // while the melody alternates between pitch 26 (degree 8) and pitch 24 (degree 14). Without
    // continuity, "first placement below the melody" flips between degree 3 (only valid choice
    // when the melody sits at 8) and degree 10 (valid once the melody jumps to 14) purely because
    // the melody's own register changed — not because the bass note moved at all. With
    // continuity, the bass should settle on one placement and stay there.
    const rootPc = 0
    const events = [
      { timeMs: 0, notes: [note(26, 0), note(17, 0)] }, // melody degree 8, bass degree 10
      { timeMs: 300, notes: [note(24, 300), note(17, 300)] }, // melody jumps to degree 14
      { timeMs: 600, notes: [note(26, 600), note(17, 600)] } // melody back to degree 8
    ]

    const roled = assignVoiceRoles(events)
    const result = placeAndReduce(roled, rootPc, () => 0, 4)

    const bassPlacements = result.events.map((e) => e.notes.find((n) => n.role === 'bass')!.relativeDegree)
    expect(new Set(bassPlacements).size).toBe(1)
  })

  it('keeps sequential melody notes close across the window boundary instead of leaping', () => {
    // Two notes one diatonic step apart in global scale-degree terms (-5 -> 2). The first sits
    // mid-window with no folding needed (relative degree 8). Folded with no memory of context,
    // the second's only reachable representative is 2 (via adding whole octaves until it's back
    // in range) — a 6-degree drop for what was really a single step up. The valid alternate
    // representative, 9, sits right next to the first note and should be preferred instead.
    const rootPc = 8
    const events = [
      { timeMs: 0, notes: [note(22)] }, // global degree 8, already inside the window
      { timeMs: 300, notes: [note(0)] } // global degree -5, naively folds to 2
    ]

    const roled = assignVoiceRoles(events)
    const result = placeAndReduce(roled, rootPc, () => 0, 4)

    const first = result.events[0].notes[0].relativeDegree
    const second = result.events[1].notes[0].relativeDegree

    expect(first).toBe(8)
    expect(Math.abs(second - first)).toBeLessThanOrEqual(2)
  })
})
