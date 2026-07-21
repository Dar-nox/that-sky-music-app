import { RHYTHM_GRID_DIVISIONS, type RhythmGrid } from '@shared/arranger'
import type { ParsedMidiNote } from '@shared/midi'

/** A set of notes that should be struck as one simultaneous gesture. */
export interface ChordEvent {
  timeMs: number
  notes: ParsedMidiNote[]
}

export interface RhythmResult {
  events: ChordEvent[]
  onsetsSnapped: number
  onsetsMerged: number
}

/** Milliseconds per grid step for a given bpm and subdivision. `null` means "don't snap". */
export function gridStepMs(bpm: number, grid: RhythmGrid): number | null {
  if (grid === 'off') return null
  const safeBpm = bpm > 0 ? bpm : 120
  const wholeNoteMs = (60000 / safeBpm) * 4
  return wholeNoteMs / RHYTHM_GRID_DIVISIONS[grid]
}

/**
 * Snaps onsets to a beat grid and collapses near-simultaneous onsets into single chord events.
 *
 * Both halves fix the same audible problem: raw MIDI (especially humanized or hand-played
 * exports) spreads a single chord across several onsets a few ms apart, and drifts off the beat.
 * On a real piano that reads as expression; through 15 discrete key presses it just sounds
 * sloppy. Snapping tightens the pulse, merging turns rolled chords into blocks.
 *
 * Note durations are preserved as-is — only onsets move. Snapping a note's onset earlier or
 * later by a fraction of a 1/16 doesn't meaningfully change how long it should sound, and
 * rewriting durations here would fight the legato-fill in sustain shaping.
 */
export function buildChordEvents(
  notes: ParsedMidiNote[],
  bpm: number,
  grid: RhythmGrid,
  onsetMergeMs: number
): RhythmResult {
  if (notes.length === 0) {
    return { events: [], onsetsSnapped: 0, onsetsMerged: 0 }
  }

  const step = gridStepMs(bpm, grid)
  let onsetsSnapped = 0

  const snapped = notes.map((note) => {
    if (step === null) return note
    const target = Math.round(note.timeMs / step) * step
    if (target !== note.timeMs) onsetsSnapped++
    return { ...note, timeMs: target }
  })

  snapped.sort((a, b) => a.timeMs - b.timeMs || b.midi - a.midi)

  // Distinct onsets first, then merge any that sit within the tolerance of the group's anchor.
  const events: ChordEvent[] = []
  let onsetsMerged = 0

  for (const note of snapped) {
    const current = events[events.length - 1]
    if (current && note.timeMs - current.timeMs <= onsetMergeMs) {
      if (note.timeMs !== current.timeMs) onsetsMerged++
      current.notes.push(note)
    } else {
      events.push({ timeMs: note.timeMs, notes: [note] })
    }
  }

  return { events, onsetsSnapped, onsetsMerged }
}
