import { randomUUID } from 'node:crypto'
import type { ArrangeOptions, ArrangementReport } from '@shared/arranger'
import { majorRootPcToKeyName, parseKeyToMajorRootPc } from '@shared/midi'
import type { SkyNote, Song } from '@shared/song'
import type { ParsedMidiInternal } from '../parse'
import { detectKey, keyFitPercent } from './keyDetect'
import { buildChordEvents, type ArrangeNote } from './rhythm'
import { assignVoiceRoles, melodyLine } from './voices'
import { planWindows, windowStartAt } from './window'
import { placeAndReduce, type PlacedNote } from './voicing'
import { selectAccompaniment } from './accompaniment'
import { suggestMelodyTrackIndex } from '../parse'

/** Fixed tap length for non-sustained notes, matching the plain converter (CLAUDE.md §5). */
const TAP_DURATION_MS = 150

/** Merges the selected tracks into one time-ordered note stream, tagged with source track. */
function mergeTracks(parsed: ParsedMidiInternal, trackIndices: number[]): ArrangeNote[] {
  if (trackIndices.length === 0) {
    throw new Error('At least one track must be selected')
  }

  const merged: ArrangeNote[] = []
  for (const trackIndex of trackIndices) {
    const track = parsed.tracks[trackIndex]
    if (!track) {
      throw new Error(`Track index ${trackIndex} does not exist in this MIDI file`)
    }
    merged.push(...track.notes.map((note) => ({ ...note, sourceTrack: trackIndex })))
  }
  return merged.sort((a, b) => a.timeMs - b.timeMs)
}

/**
 * Arranges a parsed MIDI file into a Sky note sheet.
 *
 * Unlike `convertMidiToSong`, which transcribes note-for-note, this reshapes which grid cells the
 * music lands on: melody-anchored octave windows that only shift during silence, voice-aware
 * octave folding, and harmonic voicing reduction. It never touches note timing or duration — a
 * note's `timeMs`/`durationMs` are always its real source values, exactly like the plain
 * converter. Same Song schema out, so playback and the library are unaffected.
 */
export function arrangeMidiToSong(parsed: ParsedMidiInternal, options: ArrangeOptions): Song {
  const merged = mergeTracks(parsed, options.trackIndices)
  const notesIn = merged.length

  const detected = detectKey(merged)
  const rootPc = options.autoKey ? detected.rootPc : parseKeyToMajorRootPc(options.key)
  const keyName = majorRootPcToKeyName(rootPc)
  const keyFit = options.autoKey ? detected.fitPercent : keyFitPercent(merged, rootPc)

  const { events: rawEvents } = buildChordEvents(merged)

  const selectedTracks = parsed.tracks.filter((t) => options.trackIndices.includes(t.index))
  const resolvedMelodyTrackIndex = options.autoMelodyTrack
    ? suggestMelodyTrackIndex(selectedTracks)
    : options.melodyTrackIndex

  const roled = assignVoiceRoles(rawEvents, resolvedMelodyTrackIndex)
  const windowPlan = planWindows(melodyLine(roled), rootPc, options.windowMode, options.melodyPlacement)

  const { events: placed, octaveFolds, gridCollisionsMerged, voicingReduced } = placeAndReduce(
    roled,
    rootPc,
    (timeMs) => windowStartAt(windowPlan, timeMs),
    options.maxChordNotes
  )

  const { events: thinned, densityThinned, registerSuppressed } = selectAccompaniment(
    placed,
    options.accompaniment
  )

  // Emission runs in two passes so that accompaniment can never displace the tune: a chord note
  // and a melody note that land on the same cell at the same instant would otherwise collide
  // arbitrarily depending on iteration order. The melody claims its cells first, and
  // accompaniment fills in around whatever's left. Neither pass drops a note for arriving close
  // in time on a shared cell — every note that survives voicing/accompaniment gets emitted, at
  // its own real time and duration.
  const toSkyNote = (note: PlacedNote, timeMs: number): SkyNote => {
    const hold = options.sustainCapable && note.durationMs >= options.sustainThresholdMs
    return {
      row: note.row,
      col: note.col,
      timeMs,
      durationMs: hold ? note.durationMs : TAP_DURATION_MS,
      hold
    }
  }

  const notes: SkyNote[] = []

  for (const event of thinned) {
    for (const note of event.notes) {
      if (note.role !== 'melody') continue
      notes.push(toSkyNote(note, event.timeMs))
    }
  }

  for (const event of thinned) {
    for (const note of event.notes) {
      if (note.role === 'melody') continue
      notes.push(toSkyNote(note, event.timeMs))
    }
  }

  notes.sort((a, b) => a.timeMs - b.timeMs)

  const chordEventsTotal = thinned.length
  const totalNotes = notes.length

  const report: ArrangementReport = {
    key: keyName,
    melodyTrackIndex: resolvedMelodyTrackIndex,
    keyFitPercent: keyFit,
    notesIn,
    notesOut: totalNotes,
    gridCollisionsMerged,
    voicingReduced,
    densityThinned,
    registerSuppressed,
    octaveFolds,
    windowShifts: windowPlan.windowShifts,
    chordEventsTotal,
    avgNotesPerChord: chordEventsTotal === 0 ? 0 : Math.round((totalNotes / chordEventsTotal) * 100) / 100,
    peakNotesPerSecond: peakNotesPerSecond(notes)
  }

  return {
    schemaVersion: 1,
    meta: {
      id: randomUUID(),
      generator: 'arranger',
      arrangement: report,
      title: options.title,
      artist: options.artist,
      sourceFile: options.sourceFileName,
      convertedAt: new Date().toISOString(),
      detectedKey: `${keyName} Major`,
      bpm: parsed.bpm,
      durationMs: parsed.durationMs,
      sustainInstrumentRecommended: options.sustainCapable,
      conversionReport: {
        notesTotal: notesIn,
        notesUnaltered: Math.max(0, totalNotes - octaveFolds),
        notesOctaveShifted: octaveFolds,
        notesDropped: Math.max(0, notesIn - totalNotes)
      }
    },
    notes
  }
}

/** Busiest one-second window, as a playability sanity figure for the report. */
function peakNotesPerSecond(notes: SkyNote[]): number {
  let peak = 0
  let start = 0
  for (let end = 0; end < notes.length; end++) {
    while (notes[end].timeMs - notes[start].timeMs > 1000) start++
    peak = Math.max(peak, end - start + 1)
  }
  return peak
}
