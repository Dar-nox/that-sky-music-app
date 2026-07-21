import { randomUUID } from 'node:crypto'
import type { Song, SkyNote } from '@shared/song'
import { DEFAULT_TAP_DURATION_MS, firstNonEmptyString, keyIndexToGridPosition, parseNoteKeyString, stripExtension } from './shared'

/**
 * A legacy "columns"-based sheet shape, distinct from the `songNotes` shape handled in
 * `skyMusicFormat.ts`. sky-music/sky-python-music-sheet-maker's `json_parser.py` explicitly
 * mentions supporting this as "the older SkyStudio format" alongside `songNotes`, described
 * (via research, not a byte-for-byte source read -- see below) as "a structured note format:
 * an array of [tempo, chord] pairs".
 *
 * CONFIDENCE: MEDIUM/LOW. Unlike `skyMusicFormat.ts`, this shape was NOT verified against a
 * literal source file or a raw parser dump -- only against a paraphrased summary of
 * `json_parser.py`'s handling of a `columns` field, plus a github code-search snippet showing
 * sibling metadata fields (`bitsPerPage`, `pitchLevel`, `isComposed`) on a sheet object that
 * also had a `columns` array. The reconstruction below is a best-effort, defensible reading of
 * that description:
 *   - `columns` is an ordered array of fixed-length rhythmic steps (assumed 16th-note
 *     subdivisions of `bpm`, a common convention for tracker/piano-roll-style sheet formats).
 *   - Each step is either empty/null (a rest), a single note-key string, or an array of
 *     note-key strings (a chord), using the same "{layer}Key{0-14}" key strings as the
 *     `songNotes` format.
 * A human should double-check this against a real downloaded legacy Sky Studio sheet before
 * relying on it for anything beyond the simplest cases -- if the shape doesn't match at all,
 * `looksLikeColumnsFormat` will fail detection and the caller falls through to the
 * "unrecognized format" error rather than silently producing a garbage conversion.
 */
export interface RawColumnsSong {
  name?: unknown
  author?: unknown
  arrangedBy?: unknown
  transcribedBy?: unknown
  bpm?: unknown
  pitchLevel?: unknown
  pitch?: unknown
  isEncrypted?: unknown
  columns?: unknown
}

export function looksLikeColumnsFormat(candidate: Record<string, unknown>): boolean {
  return Array.isArray(candidate.columns) && !Array.isArray(candidate.songNotes)
}

function extractStepKeyStrings(step: unknown): string[] {
  if (typeof step === 'string') return [step]
  if (Array.isArray(step)) return step.filter((s): s is string => typeof s === 'string')
  return []
}

export function normalizeColumnsSheet(raw: RawColumnsSong, sourceFileName: string): Song {
  if (raw.isEncrypted === true) {
    throw new Error(
      `"${sourceFileName}" is an encrypted sky-music sheet. SkyKeys can't decrypt community sheets -- re-export it without encryption first.`
    )
  }

  const bpm = typeof raw.bpm === 'number' && raw.bpm > 0 ? raw.bpm : 220
  // Assumed 16th-note step subdivision -- see the confidence note above.
  const stepDurationMs = 60000 / bpm / 4

  const columns = Array.isArray(raw.columns) ? raw.columns : []
  const notes: SkyNote[] = []
  let totalKeyEntries = 0
  let notesDropped = 0

  columns.forEach((step, stepIndex) => {
    const keyStrings = extractStepKeyStrings(step)
    const timeMs = stepIndex * stepDurationMs

    for (const keyStr of keyStrings) {
      totalKeyEntries++
      const keyIndex = parseNoteKeyString(keyStr)
      const position = keyIndex === null ? null : keyIndexToGridPosition(keyIndex)
      if (!position) {
        notesDropped++
        continue
      }
      notes.push({
        row: position.row,
        col: position.col,
        timeMs,
        durationMs: DEFAULT_TAP_DURATION_MS,
        hold: false
      })
    }
  })

  notes.sort((a, b) => a.timeMs - b.timeMs)

  const title = firstNonEmptyString(raw.name) || stripExtension(sourceFileName)
  const artist = firstNonEmptyString(raw.author, raw.arrangedBy, raw.transcribedBy)
  const pitchLevel = typeof raw.pitchLevel === 'number' ? raw.pitchLevel : typeof raw.pitch === 'number' ? raw.pitch : null
  const durationMs = notes.length > 0 ? notes[notes.length - 1].timeMs + notes[notes.length - 1].durationMs : 0

  return {
    schemaVersion: 1,
    meta: {
      id: randomUUID(),
      title,
      artist,
      sourceFile: sourceFileName,
      convertedAt: new Date().toISOString(),
      detectedKey: pitchLevel !== null ? `Imported (pitch level ${pitchLevel})` : 'Unknown (imported sheet)',
      bpm,
      durationMs,
      sustainInstrumentRecommended: false,
      conversionReport: {
        notesTotal: totalKeyEntries,
        notesUnaltered: notes.length,
        notesOctaveShifted: 0,
        notesDropped
      }
    },
    notes
  }
}
