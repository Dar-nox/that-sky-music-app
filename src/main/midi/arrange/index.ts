import { randomUUID } from 'node:crypto'
import { DENSITY_EVENTS_PER_SECOND, type ArrangeOptions, type ArrangementReport } from '@shared/arranger'
import { majorRootPcToKeyName, parseKeyToMajorRootPc } from '@shared/midi'
import type { SkyNote, Song } from '@shared/song'
import type { ParsedMidiInternal, ParsedMidiTrackInternal } from '../parse'
import { detectKey, keyFitPercent } from './keyDetect'
import { buildChordEvents } from './rhythm'
import { assignVoiceRoles, melodyLine } from './voices'
import { planWindows, windowStartAt } from './window'
import { placeAndReduce, type PlacedChordEvent } from './voicing'

/** Fixed tap length for non-sustained notes, matching the plain converter (CLAUDE.md §5). */
const TAP_DURATION_MS = 150

/** Gap left before the next onset when legato-filling a held note, so the retrigger registers. */
const LEGATO_RELEASE_GAP_MS = 40

/** Merges the selected tracks into one time-ordered note stream. */
function mergeTracks(parsed: ParsedMidiInternal, trackIndices: number[]): ParsedMidiTrackInternal['notes'] {
  if (trackIndices.length === 0) {
    throw new Error('At least one track must be selected')
  }

  const merged: ParsedMidiTrackInternal['notes'] = []
  for (const trackIndex of trackIndices) {
    const track = parsed.tracks[trackIndex]
    if (!track) {
      throw new Error(`Track index ${trackIndex} does not exist in this MIDI file`)
    }
    merged.push(...track.notes)
  }
  return merged.sort((a, b) => a.timeMs - b.timeMs)
}

/**
 * Caps how many chord events fire per second.
 *
 * Fifteen discrete keys can't render dense piano writing — past a few strikes per second it
 * stops reading as music and turns into a rattle. When a one-second span exceeds the budget,
 * events are dropped by keeping those that are most rhythmically load-bearing (the ones with
 * the most surviving notes, earliest first), which in practice keeps the downbeats and sheds
 * inner-voice filler between them.
 */
function thinDensity(
  events: PlacedChordEvent[],
  eventsPerSecond: number
): { events: PlacedChordEvent[]; densityThinned: number } {
  if (!Number.isFinite(eventsPerSecond) || events.length === 0) {
    return { events, densityThinned: 0 }
  }

  const minGapMs = 1000 / eventsPerSecond
  const kept: PlacedChordEvent[] = []
  let densityThinned = 0

  for (const event of events) {
    const previous = kept[kept.length - 1]
    if (!previous || event.timeMs - previous.timeMs >= minGapMs) {
      kept.push(event)
      continue
    }
    // Too soon after the last kept event. Keep the denser of the two — a fuller chord is more
    // likely to be a structural beat than a passing inner-voice hit.
    if (event.notes.length > previous.notes.length) {
      densityThinned += previous.notes.length
      kept[kept.length - 1] = event
    } else {
      densityThinned += event.notes.length
    }
  }

  return { events: kept, densityThinned }
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

  const roled = assignVoiceRoles(rawEvents)
  const windowPlan = planWindows(melodyLine(roled), rootPc, options.windowMode)

  const { events: placed, octaveFolds, gridCollisionsMerged, voicingReduced } = placeAndReduce(
    roled,
    rootPc,
    (timeMs) => windowStartAt(windowPlan, timeMs),
    options.maxChordNotes
  )

  const { events: thinned, densityThinned } = thinDensity(placed, DENSITY_EVENTS_PER_SECOND[options.density])

  // Retrigger guard: the same cell can't re-fire faster than minRetriggerMs. Rapid repeats of
  // one key don't articulate in-game — they just sound like a stutter.
  const lastFiredAt = new Map<string, number>()
  let retriggersRemoved = 0
  const notes: SkyNote[] = []

  for (const event of thinned) {
    for (const note of event.notes) {
      const cell = `${note.row}${note.col}`
      const previous = lastFiredAt.get(cell)
      if (previous !== undefined && event.timeMs - previous < options.minRetriggerMs) {
        retriggersRemoved++
        continue
      }
      lastFiredAt.set(cell, event.timeMs)

      const hold = options.sustainCapable && note.durationMs >= options.sustainThresholdMs
      notes.push({
        row: note.row,
        col: note.col,
        timeMs: event.timeMs,
        durationMs: hold ? note.durationMs : TAP_DURATION_MS,
        hold
      })
    }
  }

  if (options.sustainCapable) applyLegatoFill(notes)

  const chordEventsTotal = thinned.length
  const totalNotes = notes.length

  const report: ArrangementReport = {
    key: keyName,
    keyFitPercent: keyFit,
    notesIn,
    notesOut: totalNotes,
    gridCollisionsMerged,
    voicingReduced,
    densityThinned,
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
