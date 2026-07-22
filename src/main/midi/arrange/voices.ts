import type { ArrangeNote, ChordEvent } from './rhythm'

export type VoiceRole = 'melody' | 'bass' | 'inner'

export interface RoledNote extends ArrangeNote {
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
 * How long a gap between chord events can go before the melody line's continuity tracking
 * resets, in ms. Matches window.ts's PHRASE_GAP_MS by convention — a gap this large is already
 * treated as a phrase boundary elsewhere in the pipeline, so a stale "last melody pitch" from
 * before it shouldn't keep anchoring the next pick either.
 */
const MELODY_CONTINUITY_RESET_MS = 600

/** Picks which note in the candidate pool is the melody, given the previous pick (if any). */
function pickMelodyNote(pool: ArrangeNote[], lastMelodyMidi: number | null): ArrangeNote {
  if (pool.length === 1) return pool[0]
  if (lastMelodyMidi === null) {
    return [...pool].sort((a, b) => b.midi - a.midi)[0]
  }
  // Continuity: the note that best continues the melodic line wins, not whichever is loudest/
  // highest. This is what defeats voice-crossing — an accompaniment note that's momentarily
  // higher-pitched than the real tune loses to whichever candidate actually continues it.
  return [...pool].sort((a, b) => {
    const distanceDelta = Math.abs(a.midi - lastMelodyMidi) - Math.abs(b.midi - lastMelodyMidi)
    return distanceDelta !== 0 ? distanceDelta : b.midi - a.midi
  })[0]
}

/**
 * Tags each note in each chord event with the role it plays: the melody note is what the ear
 * tracks, the bottom note (when it sits far enough below) is the bass — what defines the
 * harmony's root — everything else is inner filler.
 *
 * Everything downstream leans on this: the octave window is anchored on the melody line, bass
 * notes get direction-aware octave folding, and voicing reduction / density thinning both drop
 * inner voices first. Without roles the arranger would be back to velocity-guessing, which is
 * what makes the plain converter's chord handling arbitrary.
 *
 * Melody identification uses two signals, composed:
 *  1. **Track identity**, when `melodyTrackIndex` is given — only notes from that track are
 *     melody candidates for a given instant. This is the strongest signal available (the user
 *     already picks tracks in the UI) and eliminates voice-crossing outright whenever melody and
 *     accompaniment live on separate tracks.
 *  2. **Continuity**, always — within the candidate pool, the note closest in pitch to the
 *     previous melody note wins, not simply whichever is highest. This is what handles the case
 *     track identity can't: melody and accompaniment sharing one track. When only one track is
 *     selected the pool is always "every note," so this degenerates to continuity-only, which is
 *     still a real improvement over pure "highest pitch wins."
 *
 * If the melody track has no note sounding at an instant, that instant gets no melody role at
 * all — a real melodic rest, not a forced substitute. This lets window re-anchoring detect actual
 * silence instead of never seeing a gap because *something* was always tagged melody.
 */
export function assignVoiceRoles(
  events: ChordEvent[],
  melodyTrackIndex: number | null = null
): RoledChordEvent[] {
  let lastMelodyMidi: number | null = null
  let lastEventTimeMs: number | null = null

  return events.map((event) => {
    if (lastEventTimeMs !== null && event.timeMs - lastEventTimeMs > MELODY_CONTINUITY_RESET_MS) {
      lastMelodyMidi = null
    }
    lastEventTimeMs = event.timeMs

    const pool =
      melodyTrackIndex !== null
        ? event.notes.filter((n) => n.sourceTrack === melodyTrackIndex)
        : event.notes

    const melodyNote = pool.length > 0 ? pickMelodyNote(pool, lastMelodyMidi) : null
    if (melodyNote) lastMelodyMidi = melodyNote.midi

    const remainder = melodyNote ? event.notes.filter((n) => n !== melodyNote) : event.notes
    const sortedRemainder = [...remainder].sort((a, b) => b.midi - a.midi)
    const melodyReference = melodyNote?.midi ?? sortedRemainder[0]?.midi ?? null
    const bottom = sortedRemainder[sortedRemainder.length - 1]
    const hasBass =
      sortedRemainder.length >= 1 &&
      melodyReference !== null &&
      melodyReference - bottom.midi >= MIN_BASS_GAP_SEMITONES

    const notes: RoledNote[] = []
    if (melodyNote) notes.push({ ...melodyNote, role: 'melody' })
    sortedRemainder.forEach((note, index) => {
      const role: VoiceRole = hasBass && index === sortedRemainder.length - 1 ? 'bass' : 'inner'
      notes.push({ ...note, role })
    })

    return { timeMs: event.timeMs, notes }
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
