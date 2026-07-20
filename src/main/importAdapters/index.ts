import type { Song } from '@shared/song'

/**
 * Detects and normalizes external community sheet formats (Sky Studio JSON,
 * the sky-music project's JSON format) into this app's schema, per CLAUDE.md §5.
 * TODO(build order step 7): implement.
 */
export function importExternalSheet(_raw: unknown): Song {
  throw new Error('importExternalSheet is not implemented yet — see CLAUDE.md §5 Import compatibility')
}
