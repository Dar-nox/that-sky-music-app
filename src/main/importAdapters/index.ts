import type { Song } from '@shared/song'
import { detectSheetFormat } from './detect'
import { normalizeSkyMusicSheet } from './skyMusicFormat'
import { normalizeColumnsSheet } from './skyStudioColumnsFormat'

/**
 * Detects and normalizes external community sheet formats (Sky Studio JSON, the
 * sky-music project's JSON format) into this app's schema, per CLAUDE.md §5.
 *
 * `rawText` is the raw file contents as read by the renderer (this app has no direct
 * filesystem access there -- see CLAUDE.md §4) and `sourceFileName` is used both for
 * `meta.sourceFile`/title fallback and in error messages.
 *
 * Community sheet sites/tools sometimes bundle multiple songs in one JSON file as a
 * top-level array. We import only the first entry -- matching the convention used by
 * sky-music/sky-python-music-sheet-maker's own `json_parser.py`
 * (`if isinstance(json_dict, list): json_dict = json_dict[0]`). Importing every song in
 * the array as separate library entries would be a reasonable future extension, but the
 * IPC contract here (one `importSheet` call -> one `Song`) intentionally mirrors
 * `convertMidi`'s one-file-in/one-song-out shape for consistency.
 */
export function importExternalSheet(rawText: string, sourceFileName: string): Song {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error(`"${sourceFileName}" is not valid JSON.`)
  }

  if (Array.isArray(parsed) && parsed.length === 0) {
    throw new Error(`"${sourceFileName}" contains an empty song list.`)
  }

  const candidate = Array.isArray(parsed) ? parsed[0] : parsed
  const detected = detectSheetFormat(candidate)

  switch (detected.format) {
    case 'sky-music':
      return normalizeSkyMusicSheet(detected.data, sourceFileName)
    case 'sky-studio-columns':
      return normalizeColumnsSheet(detected.data, sourceFileName)
  }
}
