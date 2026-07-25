import { randomUUID } from 'node:crypto'
import type { ArrangeOptions, ArrangementReport, ArrangerDiagnostics } from '@shared/arranger'
import { majorRootPcToKeyName, parseKeyToMajorRootPc } from '@shared/midi'
import type { SkyNote, Song } from '@shared/song'
import type { RootPcInput } from '../quantize'
import type { ParsedMidiInternal } from '../parse'
import { detectKey, keyFitPercent } from './keyDetect'
import { planKeySegments, keySegmentAt, type KeySegmentPlan } from './keySegment'
import { buildChordEvents, type ArrangeNote } from './rhythm'
import { assignVoiceRoles, melodyLine } from './voices'
import { planWindows, windowStartAt } from './window'
import { placeAndReduce, type PlacedNote } from './voicing'
import { avoidOverlapDissonance } from './overlap'
import { selectAccompaniment } from './accompaniment'
import { suggestMelodyTrackIndex } from '../parse'

/** Fixed tap length for non-sustained notes, matching the plain converter (CLAUDE.md §5). */
const TAP_DURATION_MS = 150

/** The single source of truth for how long a note actually sounds in-game — shared between
 * SkyNote synthesis and cross-event dissonance detection so the two can never disagree about a
 * note's real sounding window. */
function resolveSoundingDuration(
  note: PlacedNote,
  sustainCapable: boolean,
  sustainThresholdMs: number
): { durationMs: number; hold: boolean } {
  const hold = sustainCapable && note.durationMs >= sustainThresholdMs
  return { durationMs: hold ? note.durationMs : TAP_DURATION_MS, hold }
}

/**
 * Resolves the key to use when `autoKey` is on: prefers the MIDI file's own key-signature
 * metadata when present (matching Convert Mode's default), falling back to the duration-weighted
 * histogram detector only when the file has no key metadata at all.
 *
 * Raw diatonic coverage isn't a reliable proxy for "sounds right" — a histogram-optimal key can
 * cover more notes on paper than the composer's actual stated key while still sounding wrong,
 * since it optimizes for coverage rather than tonal center. A malformed/unrecognized metadata
 * string falls back to histogram detection rather than throwing.
 */
function resolveAutoKey(
  parsedDetectedKey: string | null,
  merged: ArrangeNote[]
): { rootPc: number; fitPercent: number } {
  if (parsedDetectedKey) {
    try {
      const rootPc = parseKeyToMajorRootPc(parsedDetectedKey)
      return { rootPc, fitPercent: keyFitPercent(merged, rootPc) }
    } catch {
      // Fall through to histogram detection below.
    }
  }
  return detectKey(merged)
}

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

/** Converts a KeySegmentPlan's segments into the JSON-safe shape the report/UI consume
 * (`Infinity` doesn't survive `JSON.stringify`, so the final segment's endMs becomes the song's
 * real duration). */
function reportableKeySegments(
  plan: KeySegmentPlan,
  durationMs: number
): { startMs: number; endMs: number; key: string; keyFitPercent: number }[] {
  return plan.segments.map((segment) => ({
    startMs: segment.startMs,
    endMs: Number.isFinite(segment.endMs) ? segment.endMs : durationMs,
    key: segment.keyName,
    keyFitPercent: segment.fitPercent
  }))
}

function runArrangement(
  parsed: ParsedMidiInternal,
  options: ArrangeOptions
): { song: Song; diagnostics: ArrangerDiagnostics } {
  const merged = mergeTracks(parsed, options.trackIndices)
  const notesIn = merged.length

  const autoDetected = options.autoKey ? resolveAutoKey(parsed.detectedKey, merged) : null
  const rootPc = options.autoKey ? autoDetected!.rootPc : parseKeyToMajorRootPc(options.key)
  const keyName = majorRootPcToKeyName(rootPc)
  const keyFit = options.autoKey ? autoDetected!.fitPercent : keyFitPercent(merged, rootPc)

  const keySegmentPlan = options.keySegmentation ? planKeySegments(merged, rootPc) : null
  const rootPcAt: RootPcInput = keySegmentPlan
    ? (timeMs: number) => keySegmentAt(keySegmentPlan, timeMs).rootPc
    : rootPc
  const forcedBoundariesMs = keySegmentPlan ? keySegmentPlan.segments.slice(1).map((s) => s.startMs) : []

  const { events: rawEvents } = buildChordEvents(merged)

  const selectedTracks = parsed.tracks.filter((t) => options.trackIndices.includes(t.index))
  const resolvedMelodyTrackIndex = options.autoMelodyTrack
    ? suggestMelodyTrackIndex(selectedTracks)
    : options.melodyTrackIndex

  const roled = assignVoiceRoles(rawEvents, resolvedMelodyTrackIndex)
  const windowPlan = planWindows(
    melodyLine(roled),
    rootPcAt,
    options.windowMode,
    options.melodyPlacement,
    options.responsiveWindowing,
    forcedBoundariesMs
  )

  // `clashHandling` gates the two independent clash passes. Defaulting an absent value to 'full'
  // keeps arrangements requested before the setting existed byte-identical.
  const clashHandling = options.clashHandling ?? 'full'

  const { events: placed, octaveFolds, gridCollisionsMerged, voicingReduced, dissonancesAvoided } = placeAndReduce(
    roled,
    rootPcAt,
    (timeMs) => windowStartAt(windowPlan, timeMs),
    options.maxChordNotes,
    clashHandling !== 'off'
  )

  const { events: thinned, densityThinned, registerSuppressed } = selectAccompaniment(
    placed,
    options.accompaniment
  )

  // The overlap pass is the only stage that removes a note purely for clashing, so it runs only
  // in 'full'. Skipping it is a straight pass-through — no note is touched.
  const { events: deconflicted, dissonancesAvoided: overlapDissonancesAvoided } =
    clashHandling === 'full'
      ? avoidOverlapDissonance(thinned, (note) =>
          resolveSoundingDuration(note, options.sustainCapable, options.sustainThresholdMs).durationMs
        )
      : { events: thinned, dissonancesAvoided: 0 }

  // Emission runs in two passes so that accompaniment can never displace the tune: a chord note
  // and a melody note that land on the same cell at the same instant would otherwise collide
  // arbitrarily depending on iteration order. The melody claims its cells first, and
  // accompaniment fills in around whatever's left. Neither pass drops a note for arriving close
  // in time on a shared cell — every note that survives voicing/accompaniment gets emitted, at
  // its own real time and duration.
  const toSkyNote = (note: PlacedNote, timeMs: number): SkyNote => {
    const { durationMs, hold } = resolveSoundingDuration(note, options.sustainCapable, options.sustainThresholdMs)
    return { row: note.row, col: note.col, timeMs, durationMs, hold }
  }

  const notes: SkyNote[] = []

  for (const event of deconflicted) {
    for (const note of event.notes) {
      if (note.role !== 'melody') continue
      notes.push(toSkyNote(note, event.timeMs))
    }
  }

  for (const event of deconflicted) {
    for (const note of event.notes) {
      if (note.role === 'melody') continue
      notes.push(toSkyNote(note, event.timeMs))
    }
  }

  notes.sort((a, b) => a.timeMs - b.timeMs)

  const chordEventsTotal = deconflicted.length
  const totalNotes = notes.length
  const totalDissonancesAvoided = dissonancesAvoided + overlapDissonancesAvoided

  const multiSegment = keySegmentPlan !== null && keySegmentPlan.segments.length > 1
  const reportKeyName = multiSegment ? keySegmentPlan!.segments[0].keyName : keyName
  const reportKeyFit = multiSegment ? keySegmentPlan!.segments[0].fitPercent : keyFit

  const report: ArrangementReport = {
    key: reportKeyName,
    melodyTrackIndex: resolvedMelodyTrackIndex,
    keyFitPercent: reportKeyFit,
    notesIn,
    notesOut: totalNotes,
    gridCollisionsMerged,
    voicingReduced,
    dissonancesAvoided: totalDissonancesAvoided,
    dissonancesAvoidedInChord: dissonancesAvoided,
    dissonancesAvoidedOverlap: overlapDissonancesAvoided,
    densityThinned,
    registerSuppressed,
    octaveFolds,
    windowShifts: windowPlan.windowShifts,
    chordEventsTotal,
    avgNotesPerChord: chordEventsTotal === 0 ? 0 : Math.round((totalNotes / chordEventsTotal) * 100) / 100,
    peakNotesPerSecond: peakNotesPerSecond(notes),
    ...(multiSegment ? { keySegments: reportableKeySegments(keySegmentPlan!, parsed.durationMs) } : {})
  }

  const song: Song = {
    schemaVersion: 1,
    meta: {
      id: randomUUID(),
      generator: 'arranger',
      arrangement: report,
      title: options.title,
      artist: options.artist,
      sourceFile: options.sourceFileName,
      convertedAt: new Date().toISOString(),
      detectedKey: `${reportKeyName} Major`,
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

  return {
    song,
    diagnostics: {
      options: { keySegmentation: options.keySegmentation, responsiveWindowing: options.responsiveWindowing },
      windowPlan,
      keySegmentPlan
    }
  }
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
  return runArrangement(parsed, options).song
}

/**
 * Same computation as `arrangeMidiToSong`, plus the internal `WindowPlan`/`KeySegmentPlan` the
 * dev-export tooling needs to show exactly what the Arranger decided (segment boundaries,
 * detected keys per segment, etc.) without needing to listen to the output first. Kept as a
 * separate export so normal callers and every existing test are unaffected.
 */
export function arrangeMidiWithDiagnostics(
  parsed: ParsedMidiInternal,
  options: ArrangeOptions
): { song: Song; diagnostics: ArrangerDiagnostics } {
  return runArrangement(parsed, options)
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
