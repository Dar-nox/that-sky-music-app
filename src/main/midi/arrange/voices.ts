import type { ParsedMidiNote } from '@shared/midi'
import type { ChordEvent } from './rhythm'

export type VoiceRole = 'melody' | 'bass' | 'inner'

export interface RoledNote extends ParsedMidiNote {
  role: VoiceRole
}

export interface RoledChordEvent {
  timeMs: number
  notes: RoledNote[]
}

/**
 * A chord's lowest note only counts as a separate bass voice if it sits at least this far
 * below the top note. Closer than a fifth and the "chord" is really just a melodic cluster,
 * where treating the bottom note as an independent bass line would be misleading.
 */
const MIN_BASS_GAP_SEMITONES = 7

/**
 * Tags each note in each chord event with the role it plays: the top note is the melody (what
 * the ear tracks), the bottom note is the bass (what defines the harmony's root), everything
 * between is inner filler.
 *
 * Everything downstream leans on this: the octave window is anchored on the melody line, bass
 * notes get direction-aware octave folding, and voicing reduction / density thinning both drop
 * inner voices first. Without roles the arranger would be back to velocity-guessing, which is
 * what makes the plain converter's chord handling arbitrary.
 */
export function assignVoiceRoles(events: ChordEvent[]): RoledChordEvent[] {
  return events.map((event) => {
    const sorted = [...event.notes].sort((a, b) => b.midi - a.midi)
    const top = sorted[0]
    const bottom = sorted[sorted.length - 1]
    const hasBass = sorted.length >= 2 && top.midi - bottom.midi >= MIN_BASS_GAP_SEMITONES

    return {
      timeMs: event.timeMs,
      notes: sorted.map((note, index) => {
        if (index === 0) return { ...note, role: 'melody' as const }
        if (hasBass && index === sorted.length - 1) return { ...note, role: 'bass' as const }
        return { ...note, role: 'inner' as const }
      })
    }
  })
}

/** The melody note of each event, in time order — the line the octave window is anchored on. */
export function melodyLine(events: RoledChordEvent[]): { timeMs: number; midi: number }[] {
  return events
    .map((event) => {
      const melody = event.notes.find((n) => n.role === 'melody')
      return melody ? { timeMs: event.timeMs, midi: melody.midi } : null
    })
    .filter((entry): entry is { timeMs: number; midi: number } => entry !== null)
}
