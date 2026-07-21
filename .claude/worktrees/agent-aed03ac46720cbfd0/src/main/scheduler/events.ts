import type { GridCol, GridRow, SkyNote } from '@shared/song'

export interface ScheduledKeyEvent {
  timeMs: number
  kind: 'down' | 'up'
  row: GridRow
  col: GridCol
  noteIndex: number
}

/**
 * Expands each note into a down/up pair, padding any duration shorter than
 * minTapPressMs so brief taps aren't missed by the OS/game (CLAUDE.md §8).
 * 'up' events sort before 'down' events at the same timestamp so a note
 * releases before the next one (possibly on the same key) presses.
 */
export function buildScheduledEvents(notes: SkyNote[], minTapPressMs: number): ScheduledKeyEvent[] {
  const events: ScheduledKeyEvent[] = []

  notes.forEach((note, noteIndex) => {
    const durationMs = Math.max(note.durationMs, minTapPressMs)
    events.push({ timeMs: note.timeMs, kind: 'down', row: note.row, col: note.col, noteIndex })
    events.push({ timeMs: note.timeMs + durationMs, kind: 'up', row: note.row, col: note.col, noteIndex })
  })

  return events.sort((a, b) => a.timeMs - b.timeMs || (a.kind === 'up' ? -1 : 1))
}
