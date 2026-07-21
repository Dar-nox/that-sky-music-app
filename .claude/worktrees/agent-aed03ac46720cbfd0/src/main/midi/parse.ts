import { Midi } from '@tonejs/midi'
import { majorRootPcToKeyName, type ParsedMidi, type ParsedMidiNote } from '@shared/midi'

export interface ParsedMidiTrackInternal {
  index: number
  name: string
  notes: ParsedMidiNote[]
}

/** Full per-track note data — main-process only, never crosses IPC (too large/unused by the UI). */
export interface ParsedMidiInternal {
  bpm: number
  durationMs: number
  detectedKey: string | null
  tracks: ParsedMidiTrackInternal[]
}

const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11]

/**
 * Parses a raw MIDI file into resolved note events (absolute ms via the file's
 * tempo map, not raw ticks).
 */
export function parseMidiFile(buffer: ArrayBuffer): ParsedMidiInternal {
  const midi = new Midi(buffer)

  const tracks: ParsedMidiTrackInternal[] = midi.tracks.map((track, index) => ({
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

/**
 * Fewest-simultaneous-overlapping-notes-wins heuristic for picking a starting melody
 * track suggestion (CLAUDE.md §6 step 2) — ties broken by higher average pitch. This is
 * only ever a suggestion; the user picks the real track in the UI.
 */
function suggestMelodyTrackIndex(tracks: ParsedMidiTrackInternal[]): number {
  const candidates = tracks.filter((t) => t.notes.length > 0)
  if (candidates.length === 0) return 0

  const scored = candidates.map((track) => {
    const avgPolyphony =
      track.notes.reduce((sum, note) => {
        const overlapping = track.notes.filter(
          (other) => other !== note && other.timeMs < note.timeMs + note.durationMs && other.timeMs + other.durationMs > note.timeMs
        ).length
        return sum + overlapping
      }, 0) / track.notes.length
    const avgPitch = track.notes.reduce((sum, note) => sum + note.midi, 0) / track.notes.length
    return { index: track.index, avgPolyphony, avgPitch }
  })

  scored.sort((a, b) => a.avgPolyphony - b.avgPolyphony || b.avgPitch - a.avgPitch)
  return scored[0].index
}

/** Picks the major root whose diatonic pitch-class set covers the most notes in `notes`. */
function estimateMajorKey(notes: ParsedMidiNote[]): string {
  if (notes.length === 0) return 'C'

  let bestRootPc = 0
  let bestCount = -1
  for (let rootPc = 0; rootPc < 12; rootPc++) {
    const scaleClasses = new Set(MAJOR_SCALE_STEPS.map((step) => (rootPc + step) % 12))
    const count = notes.reduce((sum, note) => sum + (scaleClasses.has(((note.midi % 12) + 12) % 12) ? 1 : 0), 0)
    if (count > bestCount) {
      bestCount = count
      bestRootPc = rootPc
    }
  }
  return majorRootPcToKeyName(bestRootPc)
}

/** Builds the IPC-safe summary sent to the renderer from a full internal parse. */
export function summarizeParsedMidi(parsed: ParsedMidiInternal): ParsedMidi {
  const allNotes = parsed.tracks.flatMap((t) => t.notes)
  return {
    bpm: parsed.bpm,
    durationMs: parsed.durationMs,
    detectedKey: parsed.detectedKey,
    estimatedKey: estimateMajorKey(allNotes),
    tracks: parsed.tracks.map((t) => ({ index: t.index, name: t.name, noteCount: t.notes.length })),
    suggestedTrackIndex: suggestMelodyTrackIndex(parsed.tracks)
  }
}
