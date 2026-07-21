import { describe, expect, it } from 'vitest'
import { importExternalSheet } from './index'

/**
 * Fixtures below model the "sky-music" / Sky Studio `songNotes` wire format, verified
 * against two independent real parsers (see confidence notes in skyMusicFormat.ts), and
 * the legacy `columns` shape (lower confidence, see skyStudioColumnsFormat.ts).
 */

function skyMusicFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Test Song',
    author: 'Test Author',
    bpm: 200,
    pitchLevel: 2,
    isEncrypted: false,
    songNotes: [
      { time: 0, key: '1Key0' },
      { time: 0, key: '1Key5' }, // chord: shares the same time
      { time: 500, key: '1Key14' },
      { time: 1000, key: '1Key7' }
    ],
    ...overrides
  }
}

describe('importExternalSheet', () => {
  it('normalizes the sky-music/Sky Studio songNotes format', () => {
    const song = importExternalSheet(JSON.stringify(skyMusicFixture()), 'test-song.json')

    expect(song.schemaVersion).toBe(1)
    expect(song.meta.title).toBe('Test Song')
    expect(song.meta.artist).toBe('Test Author')
    expect(song.meta.bpm).toBe(200)
    expect(song.meta.sustainInstrumentRecommended).toBe(false)
    expect(song.meta.conversionReport.notesTotal).toBe(4)
    expect(song.meta.conversionReport.notesUnaltered).toBe(4)
    expect(song.meta.conversionReport.notesDropped).toBe(0)
    expect(song.notes).toHaveLength(4)

    // key index 0 -> row-major position 0 -> row A, col 1 (mirrors quantize.ts's convention)
    expect(song.notes[0]).toMatchObject({ row: 'A', col: 1, timeMs: 0, hold: false })
    // key index 5 -> row B, col 1
    expect(song.notes[1]).toMatchObject({ row: 'B', col: 1, timeMs: 0 })
    // key index 14 -> row C, col 5
    expect(song.notes[2]).toMatchObject({ row: 'C', col: 5, timeMs: 500 })

    // Notes with no explicit duration/sustain info default to a short tap.
    expect(song.notes.every((n) => !n.hold)).toBe(true)
    expect(song.notes.every((n) => n.durationMs === 150)).toBe(true)
  })

  it('falls back to arrangedBy/transcribedBy and the filename when name/author are missing', () => {
    const song = importExternalSheet(
      JSON.stringify(
        skyMusicFixture({ name: undefined, author: undefined, arrangedBy: 'Some Arranger', songNotes: [{ time: 0, key: '1Key0' }] })
      ),
      'my-song.json'
    )

    expect(song.meta.title).toBe('my-song')
    expect(song.meta.artist).toBe('Some Arranger')
  })

  it('rejects an encrypted sheet with a clear error instead of guessing', () => {
    const raw = JSON.stringify(skyMusicFixture({ isEncrypted: true }))
    expect(() => importExternalSheet(raw, 'encrypted.json')).toThrow(/encrypted/i)
  })

  it('imports only the first song when the file is an array of multiple songs', () => {
    const raw = JSON.stringify([skyMusicFixture({ name: 'First' }), skyMusicFixture({ name: 'Second' })])
    const song = importExternalSheet(raw, 'bundle.json')
    expect(song.meta.title).toBe('First')
  })

  it('rejects an empty array of songs', () => {
    expect(() => importExternalSheet('[]', 'empty.json')).toThrow(/empty/i)
  })

  it('drops unparseable note entries and counts them in the conversion report', () => {
    const raw = JSON.stringify(
      skyMusicFixture({
        songNotes: [
          { time: 0, key: '1Key0' },
          { time: 100, key: '1Key99' }, // out of 0-14 range
          { time: 200, key: 'not-a-key' }, // malformed
          { time: 'oops', key: '1Key1' } // bad time
        ]
      })
    )

    const song = importExternalSheet(raw, 'lossy.json')
    expect(song.meta.conversionReport.notesTotal).toBe(4)
    expect(song.meta.conversionReport.notesUnaltered).toBe(1)
    expect(song.meta.conversionReport.notesDropped).toBe(3)
    expect(song.notes).toHaveLength(1)
  })

  it('normalizes the legacy Sky Studio "columns" format', () => {
    const raw = JSON.stringify({
      name: 'Columns Song',
      bpm: 240,
      columns: [
        ['1Key0', '1Key5'], // step 0: a chord
        null, // step 1: a rest
        '1Key14' // step 2: a single note
      ]
    })

    const song = importExternalSheet(raw, 'legacy.json')

    expect(song.meta.title).toBe('Columns Song')
    expect(song.meta.bpm).toBe(240)
    expect(song.notes).toHaveLength(3)
    expect(song.notes[0]).toMatchObject({ row: 'A', col: 1, timeMs: 0 })
    expect(song.notes[1]).toMatchObject({ row: 'B', col: 1, timeMs: 0 })
    expect(song.notes[2]).toMatchObject({ row: 'C', col: 5 })
    // Step 2's timestamp should be later than step 0's.
    expect(song.notes[2].timeMs).toBeGreaterThan(song.notes[0].timeMs)
  })

  it('rejects malformed JSON with a clear error', () => {
    expect(() => importExternalSheet('{ not valid json', 'broken.json')).toThrow(/not valid JSON/i)
  })

  it('rejects a recognized-looking object that matches no known format', () => {
    const raw = JSON.stringify({ name: 'Mystery', notes: [{ pitch: 60 }] })
    expect(() => importExternalSheet(raw, 'mystery.json')).toThrow(/unrecognized/i)
  })

  it('rejects a bare JSON primitive', () => {
    expect(() => importExternalSheet('42', 'number.json')).toThrow(/unrecognized/i)
  })
})
