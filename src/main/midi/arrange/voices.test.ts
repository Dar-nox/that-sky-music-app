import { describe, expect, it } from 'vitest'
import { assignVoiceRoles, melodyLine } from './voices'
import type { ArrangeNote, ChordEvent } from './rhythm'

function note(midi: number, sourceTrack?: number, durationMs = 200): ArrangeNote {
  return { midi, timeMs: 0, durationMs, velocity: 0.8, sourceTrack }
}

function event(timeMs: number, notes: ArrangeNote[]): ChordEvent {
  return { timeMs, notes: notes.map((n) => ({ ...n, timeMs })) }
}

describe('assignVoiceRoles', () => {
  it('picks the top pitch as melody with no track info and no history', () => {
    const result = assignVoiceRoles([event(0, [note(60), note(64), note(48)])])

    const melody = result[0].notes.find((n) => n.role === 'melody')
    expect(melody?.midi).toBe(64)
  })

  it('pins melody to the given track even when another note is higher', () => {
    // Track 1 is the accompaniment and briefly sounds a note above the real tune on track 0.
    const result = assignVoiceRoles(
      [event(0, [note(60, 0), note(72, 1)])],
      0
    )

    const melody = result[0].notes.find((n) => n.role === 'melody')
    expect(melody?.midi).toBe(60)
    expect(melody?.sourceTrack).toBe(0)
  })

  it('produces no melody note when the pinned track rests, leaving a real gap', () => {
    const events = [event(0, [note(60, 0)]), event(300, [note(72, 1)]), event(600, [note(62, 0)])]

    const result = assignVoiceRoles(events, 0)

    expect(result[1].notes.some((n) => n.role === 'melody')).toBe(false)
    const line = melodyLine(result)
    expect(line.map((n) => n.timeMs)).toEqual([0, 600])
  })

  it('uses continuity to resolve a voice-crossing outlier with no track info', () => {
    // A stepwise descending line, with an accompaniment outlier well above the line at t=200.
    const events = [
      event(0, [note(72)]),
      event(100, [note(71)]),
      event(200, [note(70), note(90)]),
      event(300, [note(69)])
    ]

    const result = assignVoiceRoles(events)
    const line = melodyLine(result)

    expect(line.map((n) => n.midi)).toEqual([72, 71, 70, 69])
  })

  it('resets continuity after a long gap and reverts to top-pitch-wins', () => {
    const events = [
      event(0, [note(60)]),
      event(700, [note(90), note(61)]) // gap > MELODY_CONTINUITY_RESET_MS (600ms)
    ]

    const result = assignVoiceRoles(events)
    const line = melodyLine(result)

    expect(line.map((n) => n.midi)).toEqual([60, 90])
  })

  it('computes bass/inner relative to the chosen melody note, not the raw top note', () => {
    // Melody is pinned to track 0's note (60), even though track 1's note (72) is higher.
    // The remaining notes (72 and 48) must be split into inner/bass relative to 60, not 72.
    const result = assignVoiceRoles([event(0, [note(60, 0), note(72, 1), note(48, 1)])], 0)

    const melody = result[0].notes.find((n) => n.role === 'melody')
    const inner = result[0].notes.find((n) => n.role === 'inner')
    const bass = result[0].notes.find((n) => n.role === 'bass')

    expect(melody?.midi).toBe(60)
    expect(inner?.midi).toBe(72)
    expect(bass?.midi).toBe(48)
  })
})
