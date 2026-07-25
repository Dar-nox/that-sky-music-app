import { describe, expect, it } from 'vitest'
import { degreeToGridPosition } from '../quantize'
import type { PlacedChordEvent, PlacedNote } from './voicing'
import type { VoiceRole } from './voices'
import { avoidOverlapDissonance } from './overlap'

function placedNote(role: VoiceRole, relativeDegree: number, durationMs: number): PlacedNote {
  const { row, col } = degreeToGridPosition(relativeDegree)
  return { row, col, relativeDegree, role, durationMs, octaveFolded: false }
}

function chordEvent(timeMs: number, notes: PlacedNote[]): PlacedChordEvent {
  return { timeMs, notes }
}

/** Treats each note's own durationMs as its real sounding window — sustain/tap semantics are
 * index.ts's concern, not this module's. */
const soundingByDuration = (n: PlacedNote): number => n.durationMs

describe('avoidOverlapDissonance', () => {
  it('drops an inner note that arrives while a still-sounding melody note clashes with it', () => {
    const events = [
      chordEvent(0, [placedNote('melody', 9, 300)]),
      chordEvent(94, [placedNote('inner', 10, 150)])
    ]

    const result = avoidOverlapDissonance(events, soundingByDuration)

    expect(result.events[1].notes).toHaveLength(0)
    expect(result.events[0].notes).toHaveLength(1)
    expect(result.dissonancesAvoided).toBe(1)
  })

  it('resolves melody self-overlap by keeping the newer note and dropping the older', () => {
    // A legato run with sustain-held notes: two melody notes a step apart still overlap in real
    // sounding time. Sky has no note decay, so this is a genuine clash, not "tune motion" — the
    // newer note wins, the older still-ringing one is dropped.
    const events = [
      chordEvent(0, [placedNote('melody', 5, 300)]),
      chordEvent(100, [placedNote('melody', 6, 150)])
    ]

    const result = avoidOverlapDissonance(events, soundingByDuration)

    expect(result.events[0].notes).toHaveLength(0)
    expect(result.events[1].notes).toHaveLength(1)
    expect(result.dissonancesAvoided).toBe(1)
  })

  it('leaves overlapping same-role notes alone when they are not actually adjacent scale degrees', () => {
    // Must not become "drop everything that overlaps" — only a genuine scale-step clash qualifies.
    const events = [
      chordEvent(0, [placedNote('melody', 5, 300)]),
      chordEvent(100, [placedNote('melody', 7, 150)])
    ]

    const result = avoidOverlapDissonance(events, soundingByDuration)

    expect(result.events[0].notes).toHaveLength(1)
    expect(result.events[1].notes).toHaveLength(1)
    expect(result.dissonancesAvoided).toBe(0)
  })

  it('resolves inner self-overlap the same way as melody self-overlap', () => {
    const events = [
      chordEvent(0, [placedNote('inner', 5, 300)]),
      chordEvent(100, [placedNote('inner', 6, 150)])
    ]

    const result = avoidOverlapDissonance(events, soundingByDuration)

    expect(result.events[0].notes).toHaveLength(0)
    expect(result.events[1].notes).toHaveLength(1)
    expect(result.dissonancesAvoided).toBe(1)
  })

  it('retroactively drops an already-accepted inner note when a melody note arrives and clashes with it', () => {
    const events = [
      chordEvent(0, [placedNote('inner', 10, 300)]),
      chordEvent(50, [placedNote('melody', 9, 150)])
    ]

    const result = avoidOverlapDissonance(events, soundingByDuration)

    expect(result.events[0].notes).toHaveLength(0) // the inner note, retroactively dropped
    expect(result.events[1].notes).toHaveLength(1)
    expect(result.dissonancesAvoided).toBe(1)
  })

  it('drops a bass note that clashes with a still-sounding melody note, since melody now outranks bass', () => {
    const events = [
      chordEvent(0, [placedNote('melody', 5, 300)]),
      chordEvent(50, [placedNote('bass', 4, 150)])
    ]

    const result = avoidOverlapDissonance(events, soundingByDuration)

    expect(result.events[0].notes).toHaveLength(1)
    expect(result.events[1].notes).toHaveLength(0)
    expect(result.dissonancesAvoided).toBe(1)
  })

  it('drops an inner note that clashes with a still-sounding bass note, since bass outranks inner', () => {
    const events = [
      chordEvent(0, [placedNote('bass', 4, 300)]),
      chordEvent(50, [placedNote('inner', 5, 150)])
    ]

    const result = avoidOverlapDissonance(events, soundingByDuration)

    expect(result.events[0].notes).toHaveLength(1)
    expect(result.events[1].notes).toHaveLength(0)
    expect(result.dissonancesAvoided).toBe(1)
  })

  it('drops an already-active inner note when a later bass note arrives and clashes with it', () => {
    const events = [
      chordEvent(0, [placedNote('inner', 5, 300)]),
      chordEvent(50, [placedNote('bass', 4, 150)])
    ]

    const result = avoidOverlapDissonance(events, soundingByDuration)

    expect(result.events[0].notes).toHaveLength(0)
    expect(result.events[1].notes).toHaveLength(1)
    expect(result.dissonancesAvoided).toBe(1)
  })

  it('keeps both notes when they never actually overlap in sounding time', () => {
    const events = [
      chordEvent(0, [placedNote('melody', 9, 150)]),
      chordEvent(500, [placedNote('inner', 10, 150)])
    ]

    const result = avoidOverlapDissonance(events, soundingByDuration)

    expect(result.events[1].notes).toHaveLength(1)
    expect(result.dissonancesAvoided).toBe(0)
  })

  it('uses the resolved sounding duration, not a note field or a blind fixed tap', () => {
    // Simulates a sustain-aware resolver: notes >=400ms are treated as held (full duration),
    // everything else as a 150ms tap.
    const sustainAware = (n: PlacedNote): number => (n.durationMs >= 400 ? n.durationMs : 150)

    const held = avoidOverlapDissonance(
      [
        chordEvent(0, [placedNote('melody', 9, 2000)]), // sustain-held: real window is 0-2000ms
        chordEvent(1500, [placedNote('inner', 10, 100)])
      ],
      sustainAware
    )
    expect(held.events[1].notes).toHaveLength(0)
    expect(held.dissonancesAvoided).toBe(1)

    // Contrast: the same melody note NOT hold-eligible only really sounds for its 150ms tap,
    // ending long before the inner note starts — no clash.
    const tapOnly = avoidOverlapDissonance(
      [
        chordEvent(0, [placedNote('melody', 9, 100)]),
        chordEvent(1500, [placedNote('inner', 10, 100)])
      ],
      sustainAware
    )
    expect(tapOnly.events[1].notes).toHaveLength(1)
    expect(tapOnly.dissonancesAvoided).toBe(0)
  })

  it('only ever thins events, never removes them, and preserves surviving note order', () => {
    const events = [
      chordEvent(0, [placedNote('melody', 9, 300), placedNote('bass', 2, 300)]),
      chordEvent(94, [placedNote('inner', 10, 150)]),
      chordEvent(500, [placedNote('melody', 5, 150)])
    ]

    const result = avoidOverlapDissonance(events, soundingByDuration)

    expect(result.events).toHaveLength(events.length)
    expect(result.events[0].notes.map((n) => n.role)).toEqual(['melody', 'bass'])
  })
})
