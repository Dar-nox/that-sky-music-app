import type { AppSettings } from './settings'
import type { Song, SongMeta } from './song'
import type { ConvertOptions, ParsedMidi } from './midi'

export const IPC_CHANNELS = {
  ping: 'app:ping',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  listLibrary: 'library:list',
  parseMidi: 'midi:parse',
  convertMidi: 'midi:convert',
  saveSong: 'song:save'
} as const

export interface SkyAPI {
  ping(): Promise<string>
  getSettings(): Promise<AppSettings>
  setSettings(settings: AppSettings): Promise<void>
  listLibrary(): Promise<SongMeta[]>
  parseMidi(buffer: ArrayBuffer): Promise<ParsedMidi>
  convertMidi(buffer: ArrayBuffer, options: ConvertOptions): Promise<Song>
  saveSong(song: Song): Promise<string>
}
