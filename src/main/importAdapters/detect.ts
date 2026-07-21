import { looksLikeSkyMusicFormat, type RawSkyMusicSong } from './skyMusicFormat'
import { looksLikeColumnsFormat, type RawColumnsSong } from './skyStudioColumnsFormat'

export type DetectedSheet =
  | { format: 'sky-music'; data: RawSkyMusicSong }
  | { format: 'sky-studio-columns'; data: RawColumnsSong }

/**
 * Identifies which known external sheet format `candidate` (a single, already-unwrapped
 * song object) matches, or throws a clear, specific error if none do. Never guesses --
 * an unrecognized shape is a hard failure rather than a best-effort partial import.
 */
export function detectSheetFormat(candidate: unknown): DetectedSheet {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Unrecognized sheet: expected a JSON object describing a song (or an array of such objects).')
  }

  const record = candidate as Record<string, unknown>

  if (looksLikeSkyMusicFormat(record)) {
    return { format: 'sky-music', data: record as RawSkyMusicSong }
  }

  if (looksLikeColumnsFormat(record)) {
    return { format: 'sky-studio-columns', data: record as RawColumnsSong }
  }

  throw new Error(
    'Unrecognized sheet format: expected a "songNotes" array (sky-music / Sky Studio format) ' +
      'or a "columns" array (legacy Sky Studio format). Neither field was found on this file.'
  )
}
