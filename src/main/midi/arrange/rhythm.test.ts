import { describe, expect, it } from 'vitest'
import type { ParsedMidiNote } from '@shared/midi'
import { buildChordEvents, gridStepMs } from './rhythm'

function note(midi: number, timeMs: number, durationMs = 200): ParsedMidiNote {
  return { midi, timeMs, durationMs, velocity: 0.8 }
}

describe('gridStepMs', () => {
  it('computes the subdivision length from bpm', () => {
    // 120bpm -> 500ms per beat -> a 1/16 note is half a beat's half = 125ms.
    expect(gridStepMs(120, '1/16')).toBe(125)
    expect(gridStepMs(120, '1/8')).toBe(250)
    expect(gridStepMs(120, '1/32')).toBe(62.5)
  })

  it('returns null when snapping is off', () => {
    expect(gridStepMs(120, 'off')).toBeNull()
  })
})

describe('buildChordEvents', () => {
  it('merges a rolled chord into a single event', () => {
    const result = buildChordEvents([note(60, 0), note(64, 18), note(67, 31)], 120, 'off', 40)

    expect(result.events).toHaveLength(1)
    expect(result.events[0].notes).toHaveLength(3)
    expect(result.onsetsMerged).toBe(2)
  })

  it('snaps an off-grid onset to the nearest subdivision', () => {
    const result = buildChordEvents([note(60, 0), note(62, 502)], 120, '1/16', 30)

    expect(result.events.map((e) => e.timeMs)).toEqual([0, 500])
    expect(result.onsetsSnapped).toBe(1)
  })

  it('keeps genuinely separate onsets apart', () => {
    const result = buildChordEvents([note(60, 0), note(62, 500), note(64, 1000)], 120, '1/16', 30)

    expect(result.events).toHaveLength(3)
    expect(result.onsetsMerged).toBe(0)
  })

  it('leaves timing untouched when the grid is off', () => {
    const result = buildChordEvents([note(60, 0), note(62, 503)], 120, 'off', 10)

    expect(result.events.map((e) => e.timeMs)).toEqual([0, 503])
    expect(result.onsetsSnapped).toBe(0)
  })

  it('handles an empty note list', () => {
    expect(buildChordEvents([], 120, '1/16', 30).events).toEqual([])
  })
})
