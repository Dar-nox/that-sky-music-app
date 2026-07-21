import { describe, expect, it } from 'vitest'
import type { ConvertOptions } from '@shared/midi'
import { convertMidiToSong } from './convert'
import type { ParsedMidiInternal } from './parse'

function baseOptions(overrides: Partial<ConvertOptions> = {}): ConvertOptions {
  return {
    trackIndices: [0],
    key: 'C',
    sustainCapable: false,
    sustainThresholdMs: 300,
    chordMode: 'melody',
    maxChordNotes: 4,
    outOfRangeMode: 'shift',
    sourceFileName: 'test.mid',
    title: 'Test Song',
    artist: 'Test Artist',
    ...overrides
  }
}

function baseParsed(notes: ParsedMidiInternal['tracks'][number]['notes']): ParsedMidiInternal {
  return {
    bpm: 120,
    durationMs: 2000,
    detectedKey: 'C',
    tracks: [{ index: 0, name: 'Melody', notes }]
  }
}

describe('convertMidiToSong', () => {
  it('converts a simple diatonic melody with an accurate conversion report', () => {
    const parsed = baseParsed([
      { midi: 60, timeMs: 0, durationMs: 200, velocity: 0.8 },
      { midi: 62, timeMs: 200, durationMs: 200, velocity: 0.8 },
      { midi: 64, timeMs: 400, durationMs: 200, velocity: 0.8 }
    ])

    const song = convertMidiToSong(parsed, baseOptions())

    expect(song.schemaVersion).toBe(1)
    expect(song.meta.title).toBe('Test Song')
    expect(song.meta.conversionReport.notesTotal).toBe(3)
    expect(song.meta.conversionReport.notesUnaltered).toBe(3)
    expect(song.meta.conversionReport.notesDropped).toBe(0)
    expect(song.notes).toHaveLength(3)
    expect(song.notes.every((n) => !n.hold)).toBe(true)
  })

  it('throws for an out-of-range track index', () => {
    const parsed = baseParsed([])
    expect(() => convertMidiToSong(parsed, baseOptions({ trackIndices: [5] }))).toThrow()
  })

  it('throws when no tracks are selected', () => {
    const parsed = baseParsed([])
    expect(() => convertMidiToSong(parsed, baseOptions({ trackIndices: [] }))).toThrow()
  })

  it('merges notes from multiple selected tracks before chord density filtering', () => {
    const parsed: ParsedMidiInternal = {
      bpm: 120,
      durationMs: 2000,
      detectedKey: 'C',
      tracks: [
        { index: 0, name: 'Right hand', notes: [{ midi: 72, timeMs: 0, durationMs: 200, velocity: 0.8 }] },
        { index: 1, name: 'Left hand', notes: [{ midi: 60, timeMs: 0, durationMs: 200, velocity: 0.6 }] }
      ]
    }

    const melodyOnly = convertMidiToSong(parsed, baseOptions({ trackIndices: [0, 1], chordMode: 'melody' }))
    expect(melodyOnly.notes).toHaveLength(1)

    const chords = convertMidiToSong(
      parsed,
      baseOptions({ trackIndices: [0, 1], chordMode: 'chords', maxChordNotes: 4 })
    )
    expect(chords.notes).toHaveLength(2)
  })

  it('keeps only the highest note per timestamp in melody chord mode', () => {
    const parsed = baseParsed([
      { midi: 60, timeMs: 0, durationMs: 200, velocity: 0.8 },
      { midi: 64, timeMs: 0, durationMs: 200, velocity: 0.5 },
      { midi: 67, timeMs: 0, durationMs: 200, velocity: 0.3 }
    ])

    const song = convertMidiToSong(parsed, baseOptions({ chordMode: 'melody' }))

    expect(song.notes).toHaveLength(1)
  })

  it('caps simultaneous notes at maxChordNotes in chords mode, keeping the loudest', () => {
    const parsed = baseParsed([
      { midi: 60, timeMs: 0, durationMs: 200, velocity: 0.9 },
      { midi: 62, timeMs: 0, durationMs: 200, velocity: 0.2 },
      { midi: 64, timeMs: 0, durationMs: 200, velocity: 0.8 },
      { midi: 65, timeMs: 0, durationMs: 200, velocity: 0.1 }
    ])

    const song = convertMidiToSong(parsed, baseOptions({ chordMode: 'chords', maxChordNotes: 2 }))

    expect(song.notes).toHaveLength(2)
  })

  it('marks a note as hold only when sustain-capable and longer than the threshold', () => {
    const parsed = baseParsed([
      { midi: 60, timeMs: 0, durationMs: 500, velocity: 0.8 },
      { midi: 62, timeMs: 500, durationMs: 100, velocity: 0.8 }
    ])

    const song = convertMidiToSong(
      parsed,
      baseOptions({ sustainCapable: true, sustainThresholdMs: 300 })
    )

    expect(song.notes[0].hold).toBe(true)
    expect(song.notes[0].durationMs).toBe(500)
    expect(song.notes[1].hold).toBe(false)
    expect(song.notes[1].durationMs).toBe(150)
  })
})
