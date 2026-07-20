import type { Song } from '@shared/song'

export interface PlaybackHandle {
  stop(): void
  setTempoMultiplier(multiplier: number): void
}

/**
 * Lookahead scheduler (checked every ~15-20ms) that fires keydown/keyup events
 * at note times scaled by the tempo multiplier, re-anchoring the clock on tempo
 * change instead of rescaling already-fired events. See CLAUDE.md §7.
 * TODO(build order step 3): implement, dry-run mode first.
 */
export function startPlayback(_song: Song, _initialTempoMultiplier: number): PlaybackHandle {
  throw new Error('startPlayback is not implemented yet — see CLAUDE.md §7')
}
