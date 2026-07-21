import { describe, expect, it, vi } from 'vitest'
import type { SongMeta } from '@shared/song'

// Importing transport.ts transitively pulls in the scheduler, which imports
// the nut.js keystroke sender — mock it the same way playback.test.ts does,
// so the real native module never loads under Vitest.
vi.mock('./keystroke/sender', () => ({
  sendKeyDown: vi.fn().mockResolvedValue(undefined),
  sendKeyUp: vi.fn().mockResolvedValue(undefined)
}))

import { resolveAdjacentSongId } from './transport'

function meta(id: string): SongMeta {
  return {
    id,
    title: id,
    artist: '',
    sourceFile: '',
    convertedAt: new Date().toISOString(),
    detectedKey: 'C Major',
    bpm: 120,
    durationMs: 0,
    sustainInstrumentRecommended: false,
    conversionReport: { notesTotal: 0, notesUnaltered: 0, notesOctaveShifted: 0, notesDropped: 0 }
  }
}

describe('resolveAdjacentSongId', () => {
  const library = [meta('a'), meta('b'), meta('c')]

  it('returns null for an empty library', () => {
    expect(resolveAdjacentSongId([], 'a', 1)).toBeNull()
  })

  it('advances to the next song', () => {
    expect(resolveAdjacentSongId(library, 'a', 1)).toBe('b')
  })

  it('wraps around forward past the last song', () => {
    expect(resolveAdjacentSongId(library, 'c', 1)).toBe('a')
  })

  it('goes back to the previous song', () => {
    expect(resolveAdjacentSongId(library, 'b', -1)).toBe('a')
  })

  it('wraps around backward before the first song', () => {
    expect(resolveAdjacentSongId(library, 'a', -1)).toBe('c')
  })

  it('starts at the first song for "next" when nothing is currently loaded', () => {
    expect(resolveAdjacentSongId(library, null, 1)).toBe('a')
  })

  it('starts at the last song for "previous" when nothing is currently loaded', () => {
    expect(resolveAdjacentSongId(library, null, -1)).toBe('c')
  })

  it('starts at the first song for "next" when the current id is not found in the library', () => {
    expect(resolveAdjacentSongId(library, 'missing-id', 1)).toBe('a')
  })

  it('starts at the last song for "previous" when the current id is not found in the library', () => {
    expect(resolveAdjacentSongId(library, 'missing-id', -1)).toBe('c')
  })

  it('wraps to itself in a single-song library', () => {
    expect(resolveAdjacentSongId([meta('only')], 'only', 1)).toBe('only')
    expect(resolveAdjacentSongId([meta('only')], 'only', -1)).toBe('only')
  })
})
