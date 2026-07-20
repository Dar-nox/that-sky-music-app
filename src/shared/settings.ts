import { DEFAULT_NOTE_KEYS, DEFAULT_TRANSPORT_HOTKEYS, type NoteKeyMap, type TransportAction } from './keybinds'

export interface AppSettings {
  noteKeys: NoteKeyMap
  transportHotkeys: Record<TransportAction, string>
  /** Notes held longer than this become `hold: true` during conversion. */
  sustainThresholdMs: number
  /** Floor applied to tap keydown->keyup duration so short presses aren't dropped by the OS/game. */
  minTapPressMs: number
  countdownSeconds: number
  targetWindowTitle: string
  dataFolder: string | null
}

export const DEFAULT_SETTINGS: AppSettings = {
  noteKeys: DEFAULT_NOTE_KEYS,
  transportHotkeys: DEFAULT_TRANSPORT_HOTKEYS,
  sustainThresholdMs: 300,
  minTapPressMs: 50,
  countdownSeconds: 3,
  targetWindowTitle: 'Sky',
  dataFolder: null
}
