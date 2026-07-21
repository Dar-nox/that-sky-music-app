import type { GridRow, GridCol } from './song'

export type NoteKeyId = `${GridRow}${GridCol}`

export type NoteKeyMap = Record<NoteKeyId, string>

export const DEFAULT_NOTE_KEYS: NoteKeyMap = {
  A1: 'Y',
  A2: 'U',
  A3: 'I',
  A4: 'O',
  A5: 'P',
  B1: 'H',
  B2: 'J',
  B3: 'K',
  B4: 'L',
  B5: ';',
  C1: 'N',
  C2: 'M',
  C3: ',',
  C4: '.',
  C5: '/'
}

export type TransportAction = 'playPause' | 'next' | 'previous' | 'panic'

export const DEFAULT_TRANSPORT_HOTKEYS: Record<TransportAction, string> = {
  playPause: 'Space',
  next: 'Right',
  previous: 'Left',
  panic: 'Escape'
}
