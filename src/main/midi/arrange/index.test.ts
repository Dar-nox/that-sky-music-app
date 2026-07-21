import { describe, expect, it } from 'vitest'
import { DEFAULT_ARRANGE_OPTIONS, type ArrangeOptions } from '@shared/arranger'
import type { ParsedMidiNote } from '@shared/midi'
import { arrangeMidiToSong } from './index'
import type { ParsedMidiInternal } from '../parse'

function options(overrides: Partial<ArrangeOptions> = {}): ArrangeOptions {
  return {
    ...DEFAULT_ARRANGE_OPTIONS,
    trackIndices: [0],
    key: 'C',
    sustainCapable: false,
    sustainThresholdMs: 300,
    sourceFileName: 'test.mid',
    title: 'Test Song',
    artist: 'Test Artist',
    ...overrides
  }
}

function note(midi: number, timeMs: number, durationMs = 200): ParsedMidiNote {
  return { midi, timeMs, durationMs, velocity: 0.8 }
}

/** A two-track fixture shaped like the split treble/bass exports of downloaded piano MIDIs. */
function twoTrackPiano(): ParsedMidiInternal {
  const rightHand: ParsedMidiNote[] = [72, 74, 76, 77, 79, 77, 76, 74].map((midi, i) =>
    note(midi, i * 500, 450)
  )
  const leftHand: ParsedMidiNote[] = [48, 55, 48, 55, 53, 60, 53, 60].map((midi, i) =>
    note(midi, i * 500, 450)
  )

  return {
    bpm: 120,
    durationMs: 4000,
    detectedKey: 'C',
    tracks: [
      { index: 0, name: 'Right hand', notes: rightHand },
      { index: 1, name: 'Left hand', notes: leftHand }
    ]
  }
}

describe('arrangeMidiToSong', () => {
  it('produces a valid song from a two-track piano file', () => {
    const song = arrangeMidiToSong(twoTrackPiano(), options({ trackIndices: [0, 1] }))

    expect(song.schemaVersion).toBe(1)
    expect(song.meta.generator).toBe('arranger')
    expect(song.meta.title).toBe('Test Song')
    expect(song.notes.length).toBeGreaterThan(0)
    expect(song.meta.arrangement).toBeDefined()
  })

  it('emits notes in time order', () => {
    const song = arrangeMidiToSong(twoTrackPiano(), options({ trackIndices: [0, 1] }))

    for (let i = 1; i < song.notes.length; i++) {
      expect(song.notes[i].timeMs).toBeGreaterThanOrEqual(song.notes[i - 1].timeMs)
    }
  })

  it('never emits the same grid cell twice at the same instant', () => {
    const song = arrangeMidiToSong(twoTrackPiano(), options({ trackIndices: [0, 1], density: 'full' }))

    const seen = new Set<string>()
    for (const n of song.notes) {
      const key = `${n.timeMs}:${n.row}${n.col}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('keeps every note inside the 15-key grid', () => {
    const song = arrangeMidiToSong(twoTrackPiano(), options({ trackIndices: [0, 1] }))

    for (const n of song.notes) {
      expect(['A', 'B', 'C']).toContain(n.row)
      expect(n.col).toBeGreaterThanOrEqual(1)
      expect(n.col).toBeLessThanOrEqual(5)
    }
  })

  it('caps simultaneous notes at maxChordNotes', () => {
    const parsed: ParsedMidiInternal = {
      bpm: 120,
      durationMs: 1000,
      detectedKey: 'C',
      tracks: [{ index: 0, name: 'Chords', notes: [36, 48, 55, 60, 64, 67, 72].map((m) => note(m, 0, 400)) }]
    }

    const song = arrangeMidiToSong(parsed, options({ maxChordNotes: 3 }))

    expect(song.notes.filter((n) => n.timeMs === 0).length).toBeLessThanOrEqual(3)
  })

  it('marks holds only when the instrument is sustain-capable', () => {
    const parsed: ParsedMidiInternal = {
      bpm: 120,
      durationMs: 2000,
      detectedKey: 'C',
      tracks: [{ index: 0, name: 'Melody', notes: [note(60, 0, 900), note(67, 1000, 100)] }]
    }

    const tapOnly = arrangeMidiToSong(parsed, options({ sustainCapable: false }))
    expect(tapOnly.notes.every((n) => !n.hold)).toBe(true)
    expect(tapOnly.notes.every((n) => n.durationMs === 150)).toBe(true)

    const sustaining = arrangeMidiToSong(parsed, options({ sustainCapable: true, sustainThresholdMs: 300 }))
    expect(sustaining.notes[0].hold).toBe(true)
    expect(sustaining.notes[0].durationMs).toBeGreaterThanOrEqual(900)
    expect(sustaining.notes[1].hold).toBe(false)
  })

  it('drops a repeat of the same cell that comes in faster than minRetriggerMs', () => {
    const parsed: ParsedMidiInternal = {
      bpm: 120,
      durationMs: 1000,
      detectedKey: 'C',
      tracks: [{ index: 0, name: 'Stutter', notes: [note(60, 0, 50), note(60, 40, 50), note(60, 600, 50)] }]
    }

    const song = arrangeMidiToSong(
      parsed,
      options({ rhythmGrid: 'off', onsetMergeMs: 0, minRetriggerMs: 200, density: 'full' })
    )

    expect(song.notes).toHaveLength(2)
    expect(song.meta.arrangement?.retriggersRemoved).toBe(1)
  })

  it('thins density when events come faster than the budget allows', () => {
    const rapid = Array.from({ length: 40 }, (_, i) => note(60 + (i % 7), i * 50, 40))
    const parsed: ParsedMidiInternal = {
      bpm: 120,
      durationMs: 2000,
      detectedKey: 'C',
      tracks: [{ index: 0, name: 'Rapid', notes: rapid }]
    }

    const sparse = arrangeMidiToSong(parsed, options({ density: 'sparse', rhythmGrid: 'off' }))
    const full = arrangeMidiToSong(parsed, options({ density: 'full', rhythmGrid: 'off' }))

    expect(sparse.notes.length).toBeLessThan(full.notes.length)
    expect(sparse.meta.arrangement?.densityThinned).toBeGreaterThan(0)
  })

  it('uses the manual key when autoKey is off', () => {
    const song = arrangeMidiToSong(twoTrackPiano(), options({ autoKey: false, key: 'G' }))

    expect(song.meta.arrangement?.key).toBe('G')
    expect(song.meta.detectedKey).toBe('G Major')
  })

  it('throws when no tracks are selected or a track does not exist', () => {
    expect(() => arrangeMidiToSong(twoTrackPiano(), options({ trackIndices: [] }))).toThrow()
    expect(() => arrangeMidiToSong(twoTrackPiano(), options({ trackIndices: [9] }))).toThrow()
  })
})
