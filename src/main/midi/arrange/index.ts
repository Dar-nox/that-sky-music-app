import { randomUUID } from 'node:crypto'
import {
  DENSITY_ACCOMPANIMENT_PER_SECOND,
  type ArrangeOptions,
  type ArrangementReport
} from '@shared/arranger'
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

/** Gap left before the next onset when legato-filling a held note, so the retrigger registers. */
const LEGATO_RELEASE_GAP_MS = 40

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
 * Unlike `convertMidiToSong`, which transcribes note-for-note, this reshapes the music to suit
 * the instrument: melody-anchored octave windows that only shift during silence, voice-aware
 * octave folding, harmonic voicing reduction, rhythmic tightening and density thinning. Same
 * Song schema out, so playback and the library are unaffected.
 */
export function arrangeMidiToSong(parsed: ParsedMidiInternal, options: ArrangeOptions): Song {
  const merged = mergeTracks(parsed, options.trackIndices)
  const notesIn = merged.length

  const detected = detectKey(merged)
  const rootPc = options.autoKey ? detected.rootPc : parseKeyToMajorRootPc(options.key)
  const keyName = majorRootPcToKeyName(rootPc)
  const keyFit = options.autoKey ? detected.fitPercent : keyFitPercent(merged, rootPc)

  const { events: rawEvents, onsetsSnapped, onsetsMerged } = buildChordEvents(
    merged,
    parsed.bpm,
    options.rhythmGrid,
    options.onsetMergeMs
  )

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

  const beatMs = parsed.bpm > 0 ? 60000 / parsed.bpm : 500
  const { events: thinned, densityThinned, registerSuppressed } = selectAccompaniment(
    placed,
    options.accompaniment,
    beatMs,
    DENSITY_ACCOMPANIMENT_PER_SECOND[options.density]
  )

  // Emission runs in two passes so that accompaniment can never displace the tune.
  //
  // A single pass with one shared retrigger map meant whichever note reached a cell first won:
  // a chord note taking cell B3 would silently swallow the melody note that needed B3 40ms
  // later. On a 15-cell grid that collision is constant, and it's what made the melody sound
  // full of holes. The melody now claims its cells first, and accompaniment fills in around it.
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

  const firedAt = new Map<string, number>()
  let retriggersRemoved = 0
  let melodyProtected = 0
  const notes: SkyNote[] = []

  // Pass 1: the melody, which only ever yields to another melody note on the same cell.
  for (const event of thinned) {
    for (const note of event.notes) {
      if (note.role !== 'melody') continue
      const cell = `${note.row}${note.col}`
      const previous = firedAt.get(cell)
      if (previous !== undefined && event.timeMs - previous < options.minRetriggerMs) {
        retriggersRemoved++
        continue
      }
      firedAt.set(cell, event.timeMs)
      notes.push(toSkyNote(note, event.timeMs))
    }
  }

  // Pass 2: accompaniment, into whatever the melody left free.
  for (const event of thinned) {
    for (const note of event.notes) {
      if (note.role === 'melody') continue
      const cell = `${note.row}${note.col}`
      const previous = firedAt.get(cell)
      if (previous !== undefined && Math.abs(event.timeMs - previous) < options.minRetriggerMs) {
        melodyProtected++
        continue
      }
      firedAt.set(cell, event.timeMs)
      notes.push(toSkyNote(note, event.timeMs))
    }
  }

  notes.sort((a, b) => a.timeMs - b.timeMs)

  if (options.sustainCapable) applyLegatoFill(notes)

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
    melodyProtected,
    retriggersRemoved,
    onsetsSnapped,
    onsetsMerged,
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

/**
 * Extends held notes to just before the next strike of the same cell.
 *
 * Raw MIDI durations often leave small gaps between notes that a player would slur together.
 * On a sustain-capable instrument those gaps become audible dropouts, so held notes are filled
 * forward — but never into the next strike of the same key, which needs a clean release.
 */
function applyLegatoFill(notes: SkyNote[]): void {
  const nextByCell = new Map<string, number>()
  for (let i = notes.length - 1; i >= 0; i--) {
    const note = notes[i]
    const cell = `${note.row}${note.col}`
    const nextTime = nextByCell.get(cell)
    if (note.hold && nextTime !== undefined) {
      const available = nextTime - LEGATO_RELEASE_GAP_MS - note.timeMs
      if (available > note.durationMs) note.durationMs = available
    }
    nextByCell.set(cell, note.timeMs)
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
