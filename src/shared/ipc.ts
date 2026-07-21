import type { AppSettings } from './settings'
import type { Song, SongMeta } from './song'
import type { ConvertOptions, ParsedMidi } from './midi'
import type { PlaybackEvent, PlaybackStatus } from './playback'

export const IPC_CHANNELS = {
  ping: 'app:ping',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  listLibrary: 'library:list',
  parseMidi: 'midi:parse',
  convertMidi: 'midi:convert',
  saveSong: 'song:save',
  loadSong: 'song:load',
  deleteSong: 'song:delete',
  importSheet: 'song:importSheet',
  playbackLoad: 'playback:load',
  playbackPlay: 'playback:play',
  playbackPause: 'playback:pause',
  playbackStop: 'playback:stop',
  playbackSetTempo: 'playback:setTempo',
  playbackSetDryRun: 'playback:setDryRun',
  playbackSeek: 'playback:seek',
  playbackPanic: 'playback:panic',
  playbackEvent: 'playback:event',
  pickDataFolder: 'settings:pickDataFolder',
  openDataFolder: 'settings:openDataFolder'
} as const

export interface SkyAPI {
  ping(): Promise<string>
  getSettings(): Promise<AppSettings>
  setSettings(settings: AppSettings): Promise<void>
  /** Opens a native folder picker. Returns the chosen path, or null if the user cancelled. */
  pickDataFolder(): Promise<string | null>
  /** Opens the effective data folder (settings.dataFolder, or its default fallback) in the OS file explorer. */
  openDataFolder(): Promise<void>
  listLibrary(): Promise<SongMeta[]>
  parseMidi(buffer: ArrayBuffer): Promise<ParsedMidi>
  convertMidi(buffer: ArrayBuffer, options: ConvertOptions): Promise<Song>
  saveSong(song: Song): Promise<string>
  loadSong(id: string): Promise<Song>
  /** Deletes a song's file from the data folder and removes it from the library index. */
  deleteSong(id: string): Promise<void>
  /** Detects + normalizes an external community sheet (Sky Studio / sky-music JSON) and
   * saves it to the library in one step. `rawText` is the raw file contents (read in the
   * renderer via `File.text()`/`FileReader`, since the renderer has no direct fs access). */
  importSheet(rawText: string, fileName: string): Promise<Song>
  playbackLoad(song: Song, dryRun: boolean): Promise<PlaybackStatus>
  playbackPlay(): Promise<PlaybackStatus>
  playbackPause(): Promise<PlaybackStatus>
  playbackStop(): Promise<PlaybackStatus>
  playbackSetTempo(multiplier: number): Promise<PlaybackStatus>
  playbackSetDryRun(dryRun: boolean): Promise<PlaybackStatus>
  playbackSeek(timeMs: number): Promise<PlaybackStatus>
  playbackPanic(): Promise<PlaybackStatus>
  onPlaybackEvent(listener: (event: PlaybackEvent) => void): () => void
}
