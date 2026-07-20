import type { GridRow, GridCol } from './song'

export type NoteKeyId = `${GridRow}${GridCol}`

export type NoteKeyMap = Record<NoteKeyId, string>

export const DEFAULT_NOTE_KEYS: NoteKeyMap = {
  A1: 'Q',
  A2: 'W',
  A3: 'E',
  A4: 'R',
  A5: 'T',
  B1: 'A',
  B2: 'S',
  B3: 'D',
  B4: 'F',
  B5: 'G',
  C1: 'Z',
  C2: 'X',
  C3: 'C',
  C4: 'V',
  C5: 'B'
}

export type TransportAction = 'playPause' | 'next' | 'previous' | 'panic'

export const DEFAULT_TRANSPORT_HOTKEYS: Record<TransportAction, string> = {
  playPause: 'Space',
  next: 'Right',
  previous: 'Left',
  panic: 'Escape'
}
