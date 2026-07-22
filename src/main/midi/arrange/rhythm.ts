import type { ParsedMidiNote } from '@shared/midi'

/** A note carrying its source MIDI track, so voice-role assignment can use track identity. */
export interface ArrangeNote extends ParsedMidiNote {
  sourceTrack?: number
}

/** A set of notes that should be struck as one simultaneous gesture. */
export interface ChordEvent {
  timeMs: number
  notes: ArrangeNote[]
}

export interface RhythmResult {
  events: ChordEvent[]
}

/**
 * Groups notes that share the exact same onset time into one chord event; every other note
 * becomes its own single-note event. No note's onset time is ever moved — the Arranger only
 * repositions pitches onto the grid, never timing.
 */
export function buildChordEvents(notes: ArrangeNote[]): RhythmResult {
  if (notes.length === 0) {
    return { events: [] }
  }

  const sorted = [...notes].sort((a, b) => a.timeMs - b.timeMs || b.midi - a.midi)

  const events: ChordEvent[] = []
  for (const note of sorted) {
    const current = events[events.length - 1]
    if (current && note.timeMs === current.timeMs) {
      current.notes.push(note)
    } else {
      events.push({ timeMs: note.timeMs, notes: [note] })
    }
  }

  return { events }
}
