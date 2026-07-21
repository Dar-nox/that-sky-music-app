import { randomUUID } from 'node:crypto'
import type { Song, SkyNote } from '@shared/song'
import { DEFAULT_TAP_DURATION_MS, firstNonEmptyString, keyIndexToGridPosition, parseNoteKeyString, stripExtension } from './shared'

/**
 * The "sky-music" community sheet format -- the wire shape used by both the
 * sky-music/sky-python-music-sheet-maker project's JSON export/import and, per research,
 * the Sky Studio mobile app's own exports (its `json_parser.py` explicitly parses both
 * "the older SkyStudio format" and the newer community format through the same
 * `songNotes` field, so in practice they converge on this shape rather than being two
 * distinct wire formats). Verified against two independent real, working parsers:
 *   - sky-music/sky-python-music-sheet-maker's `src/skymusic/parsers/json_parser.py`
 *     (reads top-level `name`, `author`/`arrangedBy`/`transcribedBy`, `bpm` (default 220),
 *     `pitchLevel`/`pitch`, `isEncrypted`, and a `songNotes` array of `{time, key}`, where
 *     `key` looks like "1Key0".."1Key14"; an array-wrapped file uses only the first song).
 *   - johnuberbacher/sky-automated-music-playstation's `script.py`
 *     (`json_data[0]['songNotes']`, `json_data[0]['bpm']`, notes keyed the same way).
 * Confidence: HIGH for the fields read here.
 */
export interface RawSkyMusicSong {
  name?: unknown
  author?: unknown
  arrangedBy?: unknown
  transcribedBy?: unknown
  bpm?: unknown
  pitchLevel?: unknown
  pitch?: unknown
  isEncrypted?: unknown
  songNotes?: unknown
}

export function looksLikeSkyMusicFormat(candidate: Record<string, unknown>): boolean {
  return Array.isArray(candidate.songNotes)
}

export function normalizeSkyMusicSheet(raw: RawSkyMusicSong, sourceFileName: string): Song {
  if (raw.isEncrypted === true) {
    throw new Error(
      `"${sourceFileName}" is an encrypted sky-music sheet. SkyKeys can't decrypt community sheets -- re-export it without encryption first.`
    )
  }

  const rawNotes = Array.isArray(raw.songNotes) ? raw.songNotes : []
  const notes: SkyNote[] = []
  let notesDropped = 0

  for (const entry of rawNotes) {
    if (!entry || typeof entry !== 'object') {
      notesDropped++
      continue
    }
    const e = entry as Record<string, unknown>
    const timeMs = typeof e.time === 'number' ? e.time : Number(e.time)
    const keyStr = typeof e.key === 'string' ? e.key : null

    if (!Number.isFinite(timeMs) || keyStr === null) {
      notesDropped++
      continue
    }

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

  notes.sort((a, b) => a.timeMs - b.timeMs)

  const title = firstNonEmptyString(raw.name) || stripExtension(sourceFileName)
  const artist = firstNonEmptyString(raw.author, raw.arrangedBy, raw.transcribedBy)
  const bpm = typeof raw.bpm === 'number' && raw.bpm > 0 ? raw.bpm : 220
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
      // We don't have a verified pitchLevel -> key-name table, so avoid asserting false
      // precision -- just surface the raw value we saw for the user's reference.
      detectedKey: pitchLevel !== null ? `Imported (pitch level ${pitchLevel})` : 'Unknown (imported sheet)',
      bpm,
      durationMs,
      sustainInstrumentRecommended: false,
      conversionReport: {
        notesTotal: rawNotes.length,
        notesUnaltered: notes.length,
        notesOctaveShifted: 0,
        notesDropped
      }
    },
    notes
  }
}
