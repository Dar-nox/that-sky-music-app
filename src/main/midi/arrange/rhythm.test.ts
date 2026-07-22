import { describe, expect, it } from 'vitest'
import type { ParsedMidiNote } from '@shared/midi'
import { buildChordEvents } from './rhythm'

function note(midi: number, timeMs: number, durationMs = 200): ParsedMidiNote {
  return { midi, timeMs, durationMs, velocity: 0.8 }
}

describe('buildChordEvents', () => {
  it('groups notes that share the exact same onset into one event', () => {
    const result = buildChordEvents([note(60, 0), note(64, 0), note(67, 0)])

    expect(result.events).toHaveLength(1)
    expect(result.events[0].notes).toHaveLength(3)
  })

  it('never moves a note off its own real onset time', () => {
    const result = buildChordEvents([note(60, 0), note(62, 503)])

    expect(result.events.map((e) => e.timeMs)).toEqual([0, 503])
  })

  it('keeps onsets a few ms apart as separate events, even if they would round to the same beat', () => {
    const result = buildChordEvents([note(60, 70), note(64, 90)])

    expect(result.events).toHaveLength(2)
    expect(result.events.map((e) => e.timeMs)).toEqual([70, 90])
  })

  it('handles an empty note list', () => {
    expect(buildChordEvents([]).events).toEqual([])
  })
})
