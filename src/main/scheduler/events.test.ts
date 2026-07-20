import { describe, expect, it } from 'vitest'
import type { SkyNote } from '@shared/song'
import { buildScheduledEvents } from './events'

function note(overrides: Partial<SkyNote> = {}): SkyNote {
  return { row: 'A', col: 1, timeMs: 0, durationMs: 200, hold: false, ...overrides }
}

describe('buildScheduledEvents', () => {
  it('expands each note into a down event and an up event', () => {
    const events = buildScheduledEvents([note({ timeMs: 0, durationMs: 200 })], 50)

    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ kind: 'down', timeMs: 0 })
    expect(events[1]).toMatchObject({ kind: 'up', timeMs: 200 })
  })

  it('pads a duration shorter than minTapPressMs up to the floor', () => {
    const events = buildScheduledEvents([note({ timeMs: 0, durationMs: 10 })], 50)

    expect(events[1].timeMs).toBe(50)
  })

  it('does not shorten a duration already longer than the floor', () => {
    const events = buildScheduledEvents([note({ timeMs: 0, durationMs: 500 })], 50)

    expect(events[1].timeMs).toBe(500)
  })

  it('sorts events chronologically, releasing before the next press at the same timestamp', () => {
    const events = buildScheduledEvents(
      [note({ row: 'A', col: 1, timeMs: 0, durationMs: 100 }), note({ row: 'A', col: 2, timeMs: 100, durationMs: 100 })],
      50
    )

    const timeline = events.map((e) => `${e.kind}:${e.row}${e.col}`)
    expect(timeline).toEqual(['down:A1', 'up:A1', 'down:A2', 'up:A2'])
  })

  it('returns an empty array for no input notes', () => {
    expect(buildScheduledEvents([], 50)).toEqual([])
  })
})
