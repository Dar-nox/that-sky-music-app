import { Midi } from '@tonejs/midi'

export interface ParsedMidiNote {
  midi: number
  timeMs: number
  durationMs: number
  velocity: number
}

export interface ParsedMidiTrack {
  index: number
  name: string
  notes: ParsedMidiNote[]
}

export interface ParsedMidi {
  bpm: number
  durationMs: number
  detectedKey: string | null
  tracks: ParsedMidiTrack[]
}

/**
 * Parses a raw MIDI file into resolved note events (absolute ms via the file's
 * tempo map, not raw ticks).
 * TODO(build order step 2): track-selection heuristics live in convert.ts, not here.
 */
export function parseMidiFile(buffer: ArrayBuffer): ParsedMidi {
  const midi = new Midi(buffer)

  const tracks: ParsedMidiTrack[] = midi.tracks.map((track, index) => ({
    index,
    name: track.name || `Track ${index + 1}`,
    notes: track.notes.map((note) => ({
      midi: note.midi,
      timeMs: note.time * 1000,
      durationMs: note.duration * 1000,
      velocity: note.velocity
    }))
  }))

  return {
    bpm: midi.header.tempos[0]?.bpm ?? 120,
    durationMs: midi.duration * 1000,
    detectedKey: midi.header.keySignatures[0]?.key ?? null,
    tracks
  }
}
