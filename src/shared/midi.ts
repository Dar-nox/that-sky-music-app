// Types shared between the main-process MIDI pipeline (src/main/midi/*) and
// the renderer (Convert Mode UI needs these for IPC typing).

export interface ParsedMidiNote {
  midi: number
  timeMs: number
  durationMs: number
  velocity: number
}

export interface ParsedMidiTrack {
  index: number
  name: string
  noteCount: number
}

export interface ParsedMidi {
  bpm: number
  durationMs: number
  /** Key read from a MIDI key-signature meta-event, e.g. "C" or "Am". Null if absent. */
  detectedKey: string | null
  /** Best-guess major key (as a root name, e.g. "G") from a pitch-class histogram, used when `detectedKey` is null. */
  estimatedKey: string
  tracks: ParsedMidiTrack[]
  /** Heuristic starting suggestion (CLAUDE.md §6 step 2) — not an automatic silent choice. */
  suggestedTrackIndex: number
}

export type ChordMode = 'melody' | 'chords'
export type OutOfRangeMode = 'shift' | 'drop' | 'clamp'

export interface ConvertOptions {
  /** One or more track indices to merge into a single note stream before conversion. */
  trackIndices: number[]
  /** Major-scale root name, e.g. "C", "F#", "Bb". */
  key: string
  sustainCapable: boolean
  sustainThresholdMs: number
  chordMode: ChordMode
  maxChordNotes: number
  outOfRangeMode: OutOfRangeMode
  /**
   * Drop any note whose pitch isn't already on the diatonic scale (an accidental/black key),
   * instead of snapping it to the nearest scale degree. Independent of `outOfRangeMode`, which
   * only governs notes outside the 2-octave grid — this is about pitch, not register.
   */
  dropAccidentals: boolean
  sourceFileName: string
  title: string
  artist: string
}

/** Circle-of-fifths order, one entry per pitch class — used to populate the Convert Mode key picker. */
export const MAJOR_KEY_NAMES = [
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'Db',
  'Ab',
  'Eb',
  'Bb',
  'F'
] as const

const NOTE_NAME_TO_PC: Record<string, number> = {
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  'E#': 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11
}

/**
 * Resolves a key name (as read from a MIDI file or picked in the UI) to a major-scale
 * root pitch class 0-11. Minor keys are folded to their relative major (same diatonic
 * pitch set) since Sky's instrument grid is diatonic-major, not mode-aware (CLAUDE.md §2).
 */
export function parseKeyToMajorRootPc(keyName: string): number {
  const trimmed = keyName.trim().replace(/major$/i, '').trim()
  const minorMatch = /^([A-Ga-g][#b]?)m$/.exec(trimmed)
  const rootName = minorMatch ? minorMatch[1] : trimmed
  const pc = NOTE_NAME_TO_PC[capitalizeNote(rootName)]
  if (pc === undefined) {
    throw new Error(`Unrecognized key name: "${keyName}"`)
  }
  // Minor keys are folded to their relative major: same diatonic pitch set, root + 3 semitones.
  return minorMatch ? (pc + 3) % 12 : pc
}

function capitalizeNote(name: string): string {
  if (name.length === 0) return name
  return name[0].toUpperCase() + name.slice(1).toLowerCase()
}

export function majorRootPcToKeyName(rootPc: number): string {
  // Matches MAJOR_KEY_NAMES' own spelling choices, indexed by pitch class instead of circle of
  // fifths, so every result round-trips back to a real dropdown option (see src/shared/midi.test.ts).
  const table = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
  return table[((rootPc % 12) + 12) % 12]
}
