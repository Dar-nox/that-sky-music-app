import { describe, expect, it } from 'vitest'
import { DEFAULT_ARRANGE_OPTIONS, type ArrangeOptions } from '@shared/arranger'
import type { ParsedMidiNote } from '@shared/midi'
import { arrangeMidiToSong, arrangeMidiWithDiagnostics } from './index'
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
    const song = arrangeMidiToSong(twoTrackPiano(), options({ trackIndices: [0, 1] }))

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
    expect(sustaining.notes[0].durationMs).toBe(900)
    expect(sustaining.notes[1].hold).toBe(false)
  })

  it('never drops a repeated cell for firing close together in time', () => {
    // The arranger used to drop a same-cell repeat that came in faster than a configurable
    // threshold. It no longer touches timing at all, so every note that reaches this point
    // should be emitted, no matter how close together.
    const parsed: ParsedMidiInternal = {
      bpm: 120,
      durationMs: 1000,
      detectedKey: 'C',
      tracks: [{ index: 0, name: 'Stutter', notes: [note(60, 0, 50), note(60, 40, 50), note(60, 600, 50)] }]
    }

    const song = arrangeMidiToSong(parsed, options({}))

    expect(song.notes).toHaveLength(3)
  })

  it('never drops melody notes, even in a fast run', () => {
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

    const song = arrangeMidiToSong(parsed, options({}))
    expect(song.notes.length).toBe(melody.length)
  })

  it('never lets accompaniment displace a melody note on the same cell', () => {
    // Regression for the "important notes can't be played because it coincides with chords"
    // bug. A single emission pass with one shared cell map meant an accompaniment note could
    // claim a cell and silently swallow the melody note that needed it a moment later.
    //
    // The failure needs accompaniment *interleaved between* melody onsets close in time — i.e.
    // broken/arpeggiated left-hand figures, which are everywhere in the solo-piano MIDIs this app
    // targets. Simultaneous notes don't trigger it (collision dedupe already resolves those in
    // the melody's favour), so the interleaving here is the point.
    const melodyOnly: ParsedMidiNote[] = []
    const withArpeggio: ParsedMidiNote[] = []
    for (let i = 0; i < 24; i++) {
      const onset = i * 120
      const m = note(72 + (i % 5), onset, 100)
      melodyOnly.push(m)
      withArpeggio.push(m)
      // Broken accompaniment landing 60ms later, on pitches that fold onto the cells the melody
      // needs next.
      withArpeggio.push(note(48 + (i % 5), onset + 60, 60))
    }

    const base = { bpm: 120, durationMs: 3000, detectedKey: 'C' as const }

    const alone = arrangeMidiToSong(
      { ...base, tracks: [{ index: 0, name: 'M', notes: melodyOnly }] },
      options({ accompaniment: 'none' })
    )
    const accompanied = arrangeMidiToSong(
      { ...base, tracks: [{ index: 0, name: 'M+arp', notes: withArpeggio }] },
      options({ accompaniment: 'full' })
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

    const counts = (['full', 'bass', 'none'] as const).map(
      (accompaniment) => arrangeMidiToSong(parsed, options({ accompaniment })).notes.length
    )

    expect(counts[0]).toBeGreaterThan(counts[2]) // full is denser than none
    expect(counts[2]).toBeLessThanOrEqual(counts[1]) // none is the sparsest
  })

  it('uses the manual key when autoKey is off', () => {
    const song = arrangeMidiToSong(twoTrackPiano(), options({ autoKey: false, key: 'G' }))

    expect(song.meta.arrangement?.key).toBe('G')
    expect(song.meta.detectedKey).toBe('G Major')
  })

  it("prefers the file's key-signature metadata over the histogram detector when autoKey is on", () => {
    // Every note is exactly on the Db major scale, so the histogram detector would pick Db
    // (100% coverage) — but the file's own metadata says E, which should win regardless.
    const dbMajorNotes: ParsedMidiNote[] = [61, 63, 65, 66, 68, 70, 72].map((midi, i) =>
      note(midi, i * 300, 280)
    )
    const parsed: ParsedMidiInternal = {
      bpm: 120,
      durationMs: 3000,
      detectedKey: 'E',
      tracks: [{ index: 0, name: 'Melody', notes: dbMajorNotes }]
    }

    const song = arrangeMidiToSong(parsed, options({ autoKey: true }))
    expect(song.meta.arrangement?.key).toBe('E')
    expect(song.meta.arrangement?.keyFitPercent).toBeLessThan(100)
  })

  it('falls back to histogram detection when the file has no key-signature metadata', () => {
    const parsed: ParsedMidiInternal = { ...twoTrackPiano(), detectedKey: null }
    const song = arrangeMidiToSong(parsed, options({ trackIndices: [0, 1] }))

    expect(song.meta.arrangement?.key).toBe('C')
  })

  it("falls back to histogram detection if the file's key metadata is unrecognized", () => {
    const parsed: ParsedMidiInternal = { ...twoTrackPiano(), detectedKey: 'not-a-real-key' }

    expect(() => arrangeMidiToSong(parsed, options({ trackIndices: [0, 1] }))).not.toThrow()
    const song = arrangeMidiToSong(parsed, options({ trackIndices: [0, 1] }))
    expect(song.meta.arrangement?.key).toBe('C')
  })

  it('throws when no tracks are selected or a track does not exist', () => {
    expect(() => arrangeMidiToSong(twoTrackPiano(), options({ trackIndices: [] }))).toThrow()
    expect(() => arrangeMidiToSong(twoTrackPiano(), options({ trackIndices: [9] }))).toThrow()
  })

  it('auto-resolves the melody track and reflects it in the report', () => {
    // Right hand has the higher average pitch, so the melody-track heuristic picks it directly.
    const song = arrangeMidiToSong(twoTrackPiano(), options({ trackIndices: [0, 1] }))

    expect(song.meta.arrangement?.melodyTrackIndex).toBe(0)
  })

  it('respects an explicit melodyTrackIndex pin over the heuristic', () => {
    const song = arrangeMidiToSong(
      twoTrackPiano(),
      options({ trackIndices: [0, 1], autoMelodyTrack: false, melodyTrackIndex: 1 })
    )

    expect(song.meta.arrangement?.melodyTrackIndex).toBe(1)
  })

  it('stays sane across a melody-track rest overlapping a voice-crossing accompaniment note', () => {
    // Regression for the emergent bug: melody rests from 600-1200ms while the accompaniment
    // keeps playing, including one note (90) well above anything the melody ever reaches. With
    // melody pinned to track 0, neither the rest nor the crossing should corrupt the pipeline.
    const melody: ParsedMidiNote[] = [note(72, 0, 250), note(74, 300, 250), note(76, 1200, 250)]
    const accompaniment: ParsedMidiNote[] = [
      note(48, 0, 250),
      note(52, 300, 250),
      note(90, 600, 250), // crosses above the melody's register during its rest
      note(52, 900, 250)
    ]
    const parsed: ParsedMidiInternal = {
      bpm: 120,
      durationMs: 1500,
      detectedKey: 'C',
      tracks: [
        { index: 0, name: 'Melody', notes: melody },
        { index: 1, name: 'Accompaniment', notes: accompaniment }
      ]
    }

    const song = arrangeMidiToSong(
      parsed,
      options({ trackIndices: [0, 1], autoMelodyTrack: false, melodyTrackIndex: 0 })
    )

    expect(song.meta.arrangement?.melodyTrackIndex).toBe(0)
    expect(song.notes.length).toBeGreaterThan(0)
    expect(song.notes.length).toBeLessThanOrEqual(melody.length + accompaniment.length)
  })
})

/** A single melody track fully diatonic to C for the first half, then hard-switching to a key
 * a semitone away (Db) for the second half — mirrors the confirmed "Hopes and Dreams" modulation
 * shape from dev-exports/findings.md. */
function modulatingMelody(): ParsedMidiInternal {
  const cPcs = [0, 2, 4, 5, 7, 9, 11]
  const dbPcs = [1, 3, 5, 6, 8, 10, 0]
  const notes: ParsedMidiNote[] = []
  let t = 0
  let i = 0
  while (t < 20000) {
    notes.push(note(60 + cPcs[i % cPcs.length], t, 240))
    t += 250
    i++
  }
  i = 0
  while (t < 40000) {
    notes.push(note(60 + dbPcs[i % dbPcs.length], t, 240))
    t += 250
    i++
  }
  return { bpm: 120, durationMs: 40000, detectedKey: 'C', tracks: [{ index: 0, name: 'Melody', notes }] }
}

describe('keySegmentation', () => {
  it('reports the detected modulation when enabled', () => {
    const song = arrangeMidiToSong(modulatingMelody(), options({ autoKey: true, keySegmentation: true }))

    expect(song.meta.arrangement?.keySegments).toBeDefined()
    expect(song.meta.arrangement?.keySegments).toHaveLength(2)
  })

  it('measurably changes note placement in the modulated section versus the flag off', () => {
    // With segmentation off, every note in the second (Db) phase gets quantized against the
    // wrong (C) key for that stretch; with it on, the same notes are quantized against their own
    // correct key. That's a different chromatic-to-diatonic snap for most of those notes, so the
    // grid cells they land on should differ, not just the report's metadata.
    const parsed = modulatingMelody()
    const off = arrangeMidiToSong(parsed, options({ autoKey: true, keySegmentation: false }))
    const on = arrangeMidiToSong(parsed, options({ autoKey: true, keySegmentation: true }))

    const cellsAfterSwitch = (song: typeof off): string =>
      song.notes
        .filter((n) => n.timeMs >= 20000)
        .map((n) => `${n.row}${n.col}`)
        .join(',')

    expect(cellsAfterSwitch(on)).not.toBe(cellsAfterSwitch(off))
  })

  it('does not report key segments for a uniformly chromatic song (false-positive guard)', () => {
    const pattern = [0, 4, 7, 1] // 3 diatonic notes + 1 chromatic passing tone, repeated throughout
    const notes: ParsedMidiNote[] = []
    let t = 0
    let i = 0
    while (t < 40000) {
      notes.push(note(60 + pattern[i % pattern.length], t, 240))
      t += 250
      i++
    }
    const parsed: ParsedMidiInternal = {
      bpm: 120,
      durationMs: 40000,
      detectedKey: 'C',
      tracks: [{ index: 0, name: 'Melody', notes }]
    }

    const song = arrangeMidiToSong(parsed, options({ autoKey: true, keySegmentation: true }))
    expect(song.meta.arrangement?.keySegments).toBeUndefined()
  })

  it('both new options default to false, unchanged from every other test in this file', () => {
    expect(DEFAULT_ARRANGE_OPTIONS.keySegmentation).toBe(false)
    expect(DEFAULT_ARRANGE_OPTIONS.responsiveWindowing).toBe(false)
  })
})

describe('responsiveWindowing (experimental)', () => {
  function wideContinuousMelody(): ParsedMidiInternal {
    const notes: ParsedMidiNote[] = [
      ...Array.from({ length: 50 }, (_, i) => note([48, 50, 52][i % 3], i * 200, 180)),
      ...Array.from({ length: 50 }, (_, i) => note([84, 86, 88][i % 3], 10000 + i * 200, 180))
    ]
    return { bpm: 120, durationMs: 20000, detectedKey: 'C', tracks: [{ index: 0, name: 'Melody', notes }] }
  }

  it('changes windowShifts on a wide continuous passage versus the flag off', () => {
    const parsed = wideContinuousMelody()
    const off = arrangeMidiToSong(parsed, options({ responsiveWindowing: false }))
    const on = arrangeMidiToSong(parsed, options({ responsiveWindowing: true }))

    expect(on.meta.arrangement!.windowShifts).toBeGreaterThan(off.meta.arrangement!.windowShifts)
  })
})

describe('cross-event dissonance avoidance', () => {
  it('drops an accompaniment note that overlaps a still-sounding melody note a step away', () => {
    // Melody (72) sustains for 1000ms (sustainCapable + a low threshold makes it hold-eligible).
    // The accompaniment note (71) fires 94ms later — well within the melody's real sounding
    // window — and lands a single scale step from it. These are two separate chord events
    // (different exact timestamps), so only the cross-event pass can catch this.
    const parsed: ParsedMidiInternal = {
      bpm: 120,
      durationMs: 2000,
      detectedKey: 'C',
      tracks: [
        { index: 0, name: 'Melody', notes: [note(72, 0, 1000)] },
        { index: 1, name: 'Accompaniment', notes: [note(71, 94, 100)] }
      ]
    }

    const song = arrangeMidiToSong(
      parsed,
      options({
        trackIndices: [0, 1],
        autoMelodyTrack: false,
        melodyTrackIndex: 0,
        sustainCapable: true,
        sustainThresholdMs: 200
      })
    )

    expect(song.notes).toHaveLength(1)
    expect(song.meta.arrangement?.dissonancesAvoided).toBeGreaterThanOrEqual(1)
  })
})

describe('clashHandling', () => {
  /** The fixture from the cross-event test above: a sustained melody note with an accompaniment
   *  note a scale step away starting while it still rings. Only the overlap pass can catch it. */
  function overlappingClash(): ParsedMidiInternal {
    return {
      bpm: 120,
      durationMs: 2000,
      detectedKey: 'C',
      tracks: [
        { index: 0, name: 'Melody', notes: [note(72, 0, 1000)] },
        { index: 1, name: 'Accompaniment', notes: [note(71, 94, 100)] }
      ]
    }
  }

  function overlapOptions(clashHandling: ArrangeOptions['clashHandling']): ArrangeOptions {
    return options({
      trackIndices: [0, 1],
      autoMelodyTrack: false,
      melodyTrackIndex: 0,
      sustainCapable: true,
      sustainThresholdMs: 200,
      clashHandling
    })
  }

  it("'chords' keeps a note the overlap pass would have dropped", () => {
    const song = arrangeMidiToSong(overlappingClash(), overlapOptions('chords'))

    expect(song.notes).toHaveLength(2)
    expect(song.meta.arrangement?.dissonancesAvoidedOverlap).toBe(0)
  })

  it("'off' keeps it too", () => {
    const song = arrangeMidiToSong(overlappingClash(), overlapOptions('off'))

    expect(song.notes).toHaveLength(2)
    expect(song.meta.arrangement?.dissonancesAvoided).toBe(0)
  })

  it("'full' is the default and still drops it", () => {
    const song = arrangeMidiToSong(overlappingClash(), overlapOptions('full'))

    expect(song.notes).toHaveLength(1)
    expect(song.meta.arrangement?.dissonancesAvoidedOverlap).toBeGreaterThanOrEqual(1)
    expect(DEFAULT_ARRANGE_OPTIONS.clashHandling).toBe('full')
  })

  it("'off' never reports a clash drop anywhere in the pipeline", () => {
    // The in-chord skip's own behavior is unit-tested in voicing.test.ts, where the chord's roles
    // and window can be pinned exactly. What matters here is the end-to-end contract: 'off'
    // must not remove a single note for clashing, at either stage.
    const song = arrangeMidiToSong(
      twoTrackPiano(),
      options({ trackIndices: [0, 1], maxChordNotes: 3, clashHandling: 'off' })
    )
    const report = song.meta.arrangement!

    expect(report.dissonancesAvoided).toBe(0)
    expect(report.dissonancesAvoidedInChord).toBe(0)
    expect(report.dissonancesAvoidedOverlap).toBe(0)
  })

  it('relaxing clash handling never yields fewer notes', () => {
    const parsed = overlappingClash()
    const counts = (['full', 'chords', 'off'] as const).map(
      (mode) => arrangeMidiToSong(parsed, overlapOptions(mode)).notes.length
    )

    expect(counts[1]).toBeGreaterThanOrEqual(counts[0])
    expect(counts[2]).toBeGreaterThanOrEqual(counts[1])
  })

  it('splits the report counter into in-chord and overlap shares that sum to the total', () => {
    const song = arrangeMidiToSong(overlappingClash(), overlapOptions('full'))
    const report = song.meta.arrangement!

    expect(report.dissonancesAvoidedInChord! + report.dissonancesAvoidedOverlap!).toBe(
      report.dissonancesAvoided
    )
  })
})

describe('arrangeMidiWithDiagnostics', () => {
  it('keySegmentPlan is null when keySegmentation is off', () => {
    const { diagnostics } = arrangeMidiWithDiagnostics(
      twoTrackPiano(),
      options({ trackIndices: [0, 1], keySegmentation: false })
    )

    expect(diagnostics.keySegmentPlan).toBeNull()
    expect(diagnostics.options.keySegmentation).toBe(false)
  })

  it('keySegmentPlan is populated with a chunk trace when keySegmentation is on', () => {
    const { diagnostics } = arrangeMidiWithDiagnostics(
      modulatingMelody(),
      options({ autoKey: true, keySegmentation: true })
    )

    expect(diagnostics.keySegmentPlan).not.toBeNull()
    expect(diagnostics.keySegmentPlan!.chunkTrace.length).toBeGreaterThan(0)
    expect(diagnostics.keySegmentPlan!.segments).toHaveLength(2)
  })

  it('windowPlan segments carry reason tags', () => {
    const { diagnostics } = arrangeMidiWithDiagnostics(twoTrackPiano(), options({ trackIndices: [0, 1] }))

    expect(diagnostics.windowPlan.segments[0].reason).toBeDefined()
  })

  it('produces the same notes as arrangeMidiToSong', () => {
    const parsed = twoTrackPiano()
    const opts = options({ trackIndices: [0, 1] })

    const song1 = arrangeMidiToSong(parsed, opts)
    const { song: song2 } = arrangeMidiWithDiagnostics(parsed, opts)

    expect(song2.notes).toEqual(song1.notes)
  })
})
