import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaybackEvent } from '@shared/playback'
import type { Song } from '@shared/song'
import { DEFAULT_NOTE_KEYS } from '@shared/keybinds'

vi.mock('../keystroke/sender', () => ({
  sendKeyDown: vi.fn().mockResolvedValue(undefined),
  sendKeyUp: vi.fn().mockResolvedValue(undefined)
}))

import { PlaybackScheduler } from './playback'

function makeSong(): Song {
  return {
    schemaVersion: 1,
    meta: {
      id: 'song-1',
      title: 'Test',
      artist: '',
      sourceFile: 'test.mid',
      convertedAt: new Date().toISOString(),
      detectedKey: 'C Major',
      bpm: 120,
      durationMs: 300,
      sustainInstrumentRecommended: false,
      conversionReport: { notesTotal: 2, notesUnaltered: 2, notesOctaveShifted: 0, notesDropped: 0 }
    },
    notes: [
      { row: 'A', col: 1, timeMs: 0, durationMs: 100, hold: false },
      { row: 'A', col: 2, timeMs: 150, durationMs: 100, hold: false }
    ]
  }
}

describe('PlaybackScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires note down/up events in order and reports ended at completion, in dry-run mode', () => {
    const scheduler = new PlaybackScheduler()
    const events: PlaybackEvent[] = []
    scheduler.onEvent((e) => events.push(e))

    scheduler.load(makeSong(), DEFAULT_NOTE_KEYS, 50, true)
    scheduler.play()

    vi.advanceTimersByTime(300)

    const noteEvents = events.filter((e) => e.type === 'note')
    expect(noteEvents.map((e) => `${e.kind}:${e.row}${e.col}`)).toEqual([
      'down:A1',
      'up:A1',
      'down:A2',
      'up:A2'
    ])
    expect(events.some((e) => e.type === 'ended')).toBe(true)
  })

  it('pause freezes elapsed time and resume continues from where it left off', () => {
    const scheduler = new PlaybackScheduler()
    scheduler.load(makeSong(), DEFAULT_NOTE_KEYS, 50, true)
    scheduler.play()

    vi.advanceTimersByTime(50)
    scheduler.pause()
    const pausedElapsed = scheduler.getStatus().elapsedMs

    vi.advanceTimersByTime(1000)
    expect(scheduler.getStatus().elapsedMs).toBe(pausedElapsed)

    scheduler.play()
    vi.advanceTimersByTime(16)
    expect(scheduler.getStatus().elapsedMs).toBeGreaterThan(pausedElapsed)
  })

  it('stop resets the cursor so playback restarts from the beginning', () => {
    const scheduler = new PlaybackScheduler()
    const events: PlaybackEvent[] = []
    scheduler.onEvent((e) => events.push(e))

    scheduler.load(makeSong(), DEFAULT_NOTE_KEYS, 50, true)
    scheduler.play()
    vi.advanceTimersByTime(300)
    expect(scheduler.getStatus().state).toBe('stopped')

    events.length = 0
    scheduler.play()
    vi.advanceTimersByTime(300)

    const noteEvents = events.filter((e) => e.type === 'note')
    expect(noteEvents).toHaveLength(4)
  })

  it('re-anchors elapsed time instead of rescaling on a tempo change', () => {
    const longSong = makeSong()
    longSong.meta.durationMs = 10000
    longSong.notes = [{ row: 'A', col: 1, timeMs: 0, durationMs: 9000, hold: true }]

    const scheduler = new PlaybackScheduler()
    scheduler.load(longSong, DEFAULT_NOTE_KEYS, 50, true)
    scheduler.play()

    vi.advanceTimersByTime(100)
    scheduler.setTempo(2)
    const afterChange = scheduler.getStatus().elapsedMs
    expect(afterChange).toBeCloseTo(100, 0)

    vi.advanceTimersByTime(100)
    expect(scheduler.getStatus().elapsedMs).toBeCloseTo(afterChange + 200, 0)
  })
})
