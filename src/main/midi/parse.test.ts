import { describe, expect, it } from 'vitest'
import type { ParsedMidiNote } from '@shared/midi'
import { suggestMelodyTrackIndex, type ParsedMidiTrackInternal } from './parse'

function note(midi: number, timeMs: number, durationMs = 400): ParsedMidiNote {
  return { midi, timeMs, durationMs, velocity: 0.8 }
}

describe('suggestMelodyTrackIndex', () => {
  it('picks the higher-pitched track even when it has more simultaneous notes', () => {
    // Shaped like the real songs that exposed this bug: a sparse, low, non-overlapping bass
    // line (lower polyphony) alongside a higher, more harmonically active melody line (higher
    // polyphony). A polyphony-first heuristic would wrongly pick the bass track here.
    const bass: ParsedMidiTrackInternal = {
      index: 0,
      name: 'Bass',
      notes: [note(40, 0), note(43, 500), note(45, 1000), note(40, 1500)]
    }
    const melody: ParsedMidiTrackInternal = {
      index: 1,
      name: 'Melody',
      notes: [
        note(72, 0),
        note(74, 500),
        // A harmonized moment: two overlapping notes, raising this track's polyphony above
        // the bass track's.
        note(76, 1000),
        note(79, 1000)
      ]
    }

    expect(suggestMelodyTrackIndex([bass, melody])).toBe(1)
  })

  it('falls back to fewer simultaneous notes when average pitch is tied', () => {
    const chordal: ParsedMidiTrackInternal = {
      index: 0,
      name: 'Chords',
      notes: [note(58, 0), note(62, 0)] // avg pitch 60, overlapping (polyphony > 0)
    }
    const singleLine: ParsedMidiTrackInternal = {
      index: 1,
      name: 'Single line',
      notes: [note(60, 0, 200), note(60, 500, 200), note(60, 1000, 200)] // avg pitch 60, no overlap
    }

    expect(suggestMelodyTrackIndex([chordal, singleLine])).toBe(1)
  })

  it('returns 0 when no track has any notes', () => {
    const empty: ParsedMidiTrackInternal = { index: 0, name: 'Empty', notes: [] }
    expect(suggestMelodyTrackIndex([empty])).toBe(0)
  })
})
