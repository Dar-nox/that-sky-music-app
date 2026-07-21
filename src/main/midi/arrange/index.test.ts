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

  it('thins accompaniment when it comes faster than the budget allows', () => {
    // A melody with a chord under every note, so there is accompaniment available to thin.
    const notes: ParsedMidiNote[] = []
    for (let i = 0; i < 16; i++) {
      notes.push(note(72 + (i % 5), i * 200, 180))
      notes.push(note(48, i * 200, 180))
      notes.push(note(52, i * 200, 180))
    }
    const parsed: ParsedMidiInternal = {
      bpm: 120,
      durationMs: 3200,
      detectedKey: 'C',
      tracks: [{ index: 0, name: 'Melody + chords', notes }]
    }

    const sparse = arrangeMidiToSong(parsed, options({ density: 'sparse', accompaniment: 'full' }))
    const full = arrangeMidiToSong(parsed, options({ density: 'full', accompaniment: 'full' }))

    expect(sparse.notes.length).toBeLessThan(full.notes.length)
    expect(sparse.meta.arrangement?.densityThinned).toBeGreaterThan(0)
  })

  it('never drops melody notes to density thinning, even in a fast run', () => {
    // Regression: density thinning used to cap *all* events, so a 16th-note run at 140bpm lost
    // half its notes — melody included — and the survivors were re-timed, mangling the rhythm.
    const stepMs = ((60000 / 140) * 4) / 16
    const melody = Array.from({ length: 32 }, (_, i) =>
      note(72 + (i % 8), Math.round(i * stepMs), 80)
    )
    const parsed: ParsedMidiInternal = {
      bpm: 140,
      durationMs: 4000,
      detectedKey: 'C',
      tracks: [{ index: 0, name: 'Fast run', notes: melody }]
    }

    for (const density of ['sparse', 'medium', 'full'] as const) {
      const song = arrangeMidiToSong(parsed, options({ density, rhythmGrid: 'off' }))
      expect(song.notes.length).toBe(melody.length)
    }
  })

  it('never lets accompaniment displace a melody note on the same cell', () => {
    // Regression for the "important notes can't be played because it coincides with chords"
    // bug. A single emission pass with one shared retrigger map meant an accompaniment note
    // could claim a cell and silently swallow the melody note that needed it a moment later.
    //
    // The failure needs accompaniment *interleaved between* melody onsets closer than
    // minRetriggerMs — i.e. broken/arpeggiated left-hand figures, which are everywhere in the
    // solo-piano MIDIs this app targets. Simultaneous notes don't trigger it (collision dedupe
    // already resolves those in the melody's favour), so the interleaving here is the point.
    const melodyOnly: ParsedMidiNote[] = []
    const withArpeggio: ParsedMidiNote[] = []
    for (let i = 0; i < 24; i++) {
      const onset = i * 120
      const m = note(72 + (i % 5), onset, 100)
      melodyOnly.push(m)
      withArpeggio.push(m)
      // Broken accompaniment landing 60ms later, inside the 70ms retrigger window, on pitches
      // that fold onto the cells the melody needs next.
      withArpeggio.push(note(48 + (i % 5), onset + 60, 60))
    }

    const base = { bpm: 120, durationMs: 3000, detectedKey: 'C' as const }
    // rhythmGrid off: snapping would quantise the arpeggio onto the melody's grid and mask it.
    const opts = { rhythmGrid: 'off' as const, onsetMergeMs: 0, density: 'full' as const }

    const alone = arrangeMidiToSong(
      { ...base, tracks: [{ index: 0, name: 'M', notes: melodyOnly }] },
      options({ ...opts, accompaniment: 'none' })
    )
    const accompanied = arrangeMidiToSong(
      { ...base, tracks: [{ index: 0, name: 'M+arp', notes: withArpeggio }] },
      options({ ...opts, accompaniment: 'full' })
    )

    expect(alone.notes).toHaveLength(24)

    // Every instant the melody sounds on its own must still carry a note once the arpeggio is
    // added. Accompaniment may add notes; it must never remove melodic events.
    const accompaniedTimes = new Set(accompanied.notes.map((n) => n.timeMs))
    for (const n of alone.notes) {
      expect(accompaniedTimes.has(n.timeMs)).toBe(true)
    }
  })

  it('reduces clutter as the accompaniment mode gets sparser', () => {
    const notes: ParsedMidiNote[] = []
    for (let i = 0; i < 16; i++) {
      notes.push(note(74 + (i % 5), i * 250, 220))
      notes.push(note(43, i * 250, 220), note(50, i * 250, 220), note(59, i * 250, 220))
    }
    const parsed: ParsedMidiInternal = {
      bpm: 120,
      durationMs: 4000,
      detectedKey: 'C',
      tracks: [{ index: 0, name: 'Dense', notes }]
    }

    const counts = (['full', 'harmony', 'bass', 'none'] as const).map(
      (accompaniment) => arrangeMidiToSong(parsed, options({ accompaniment })).notes.length
    )

    expect(counts[0]).toBeGreaterThan(counts[3]) // full is denser than none
    expect(counts[1]).toBeLessThanOrEqual(counts[0]) // harmony gating thins full
    expect(counts[3]).toBeLessThanOrEqual(counts[2]) // none is the sparsest
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
