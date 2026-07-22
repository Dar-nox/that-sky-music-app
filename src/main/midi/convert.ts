import { randomUUID } from 'node:crypto'
import type { Song, SkyNote } from '@shared/song'
import type { ConvertOptions } from '@shared/midi'
import { parseKeyToMajorRootPc } from '@shared/midi'
import type { ParsedMidiInternal, ParsedMidiTrackInternal } from './parse'
import { quantizeNotes, type QuantizeInput } from './quantize'

/** Fixed tap length for non-sustained notes (CLAUDE.md §5: "a fixed short tap regardless of the original note's duration"). */
const DEFAULT_TAP_DURATION_MS = 150

function groupByTimestamp(notes: ParsedMidiTrackInternal['notes']): Map<number, typeof notes> {
  const groups = new Map<number, typeof notes>()
  for (const note of notes) {
    const bucket = groups.get(note.timeMs)
    if (bucket) bucket.push(note)
    else groups.set(note.timeMs, [note])
  }
  return groups
}

function applyChordDensity(
  notes: ParsedMidiTrackInternal['notes'],
  chordMode: ConvertOptions['chordMode'],
  maxChordNotes: number
): ParsedMidiTrackInternal['notes'] {
  const groups = groupByTimestamp(notes)
  const result: ParsedMidiTrackInternal['notes'] = []

  for (const group of groups.values()) {
    if (chordMode === 'melody') {
      result.push(group.reduce((highest, note) => (note.midi > highest.midi ? note : highest)))
    } else {
      const capped = [...group].sort((a, b) => b.velocity - a.velocity || b.midi - a.midi).slice(0, maxChordNotes)
      result.push(...capped)
    }
  }

  return result.sort((a, b) => a.timeMs - b.timeMs)
}

/**
 * Orchestrates parse -> chord density -> quantize -> schema export for Convert Mode
 * (CLAUDE.md §6).
 */
export function convertMidiToSong(parsed: ParsedMidiInternal, options: ConvertOptions): Song {
  if (options.trackIndices.length === 0) {
    throw new Error('At least one track must be selected')
  }

  const mergedNotes: ParsedMidiTrackInternal['notes'] = []
  for (const trackIndex of options.trackIndices) {
    const track = parsed.tracks[trackIndex]
    if (!track) {
      throw new Error(`Track index ${trackIndex} does not exist in this MIDI file`)
    }
    mergedNotes.push(...track.notes)
  }
  mergedNotes.sort((a, b) => a.timeMs - b.timeMs)

  const densityFiltered = applyChordDensity(mergedNotes, options.chordMode, options.maxChordNotes)
  const rootPc = parseKeyToMajorRootPc(options.key)

  const quantizeInputs: QuantizeInput[] = densityFiltered.map((n) => ({ midi: n.midi, timeMs: n.timeMs }))
  const quantized = quantizeNotes(quantizeInputs, rootPc, options.outOfRangeMode, options.dropAccidentals)

  const notes: SkyNote[] = []
  let notesUnaltered = 0
  let notesOctaveShifted = 0
  let notesDropped = 0

  quantized.forEach((q, i) => {
    if (q.dropped || !q.position) {
      notesDropped++
      return
    }
    if (q.altered) notesOctaveShifted++
    else notesUnaltered++

    const source = densityFiltered[i]
    const hold = options.sustainCapable && source.durationMs > options.sustainThresholdMs
    notes.push({
      row: q.position.row,
      col: q.position.col,
      timeMs: source.timeMs,
      durationMs: hold ? source.durationMs : DEFAULT_TAP_DURATION_MS,
      hold
    })
  })

  return {
    schemaVersion: 1,
    meta: {
      id: randomUUID(),
      title: options.title,
      artist: options.artist,
      sourceFile: options.sourceFileName,
      convertedAt: new Date().toISOString(),
      detectedKey: `${options.key} Major`,
      bpm: parsed.bpm,
      durationMs: parsed.durationMs,
      sustainInstrumentRecommended: options.sustainCapable,
      conversionReport: {
        notesTotal: quantized.length,
        notesUnaltered,
        notesOctaveShifted,
        notesDropped
      }
    },
    notes
  }
}
