import type { GridCol, GridRow } from './song'

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'stopped'

export interface PlaybackStatus {
  state: PlaybackState
  songId: string | null
  elapsedMs: number
  durationMs: number
  tempoMultiplier: number
  dryRun: boolean
}

export type PlaybackEvent =
  | { type: 'status'; status: PlaybackStatus }
  | { type: 'note'; row: GridRow; col: GridCol; kind: 'down' | 'up'; timeMs: number }
  | { type: 'ended' }
  | { type: 'error'; message: string }
