import type { AppSettings } from './settings'
import type { SongMeta } from './song'

export const IPC_CHANNELS = {
  ping: 'app:ping',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  listLibrary: 'library:list'
} as const

export interface SkyAPI {
  ping(): Promise<string>
  getSettings(): Promise<AppSettings>
  setSettings(settings: AppSettings): Promise<void>
  listLibrary(): Promise<SongMeta[]>
}
