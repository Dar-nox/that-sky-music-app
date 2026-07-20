import type { Song } from '@shared/song'
import type { ParsedMidi } from './parse'

export interface ConvertOptions {
  trackIndex: number
  key: string
  sustainCapable: boolean
  sustainThresholdMs: number
  chordMode: 'melody' | 'chords'
  maxChordNotes: number
}

/**
 * Orchestrates parse -> quantize -> schema export for Convert Mode.
 * TODO(build order step 2): implement the full pipeline described in CLAUDE.md §6.
 */
export function convertMidiToSong(_parsed: ParsedMidi, _options: ConvertOptions): Song {
  throw new Error('convertMidiToSong is not implemented yet — see CLAUDE.md §6')
}
