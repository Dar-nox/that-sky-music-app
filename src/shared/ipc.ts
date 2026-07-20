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
  playbackLoad: 'playback:load',
  playbackPlay: 'playback:play',
  playbackPause: 'playback:pause',
  playbackStop: 'playback:stop',
  playbackSetTempo: 'playback:setTempo',
  playbackSetDryRun: 'playback:setDryRun',
  playbackPanic: 'playback:panic',
  playbackEvent: 'playback:event'
} as const

export interface SkyAPI {
  ping(): Promise<string>
  getSettings(): Promise<AppSettings>
  setSettings(settings: AppSettings): Promise<void>
  listLibrary(): Promise<SongMeta[]>
  parseMidi(buffer: ArrayBuffer): Promise<ParsedMidi>
  convertMidi(buffer: ArrayBuffer, options: ConvertOptions): Promise<Song>
  saveSong(song: Song): Promise<string>
  loadSong(id: string): Promise<Song>
  playbackLoad(song: Song, dryRun: boolean): Promise<PlaybackStatus>
  playbackPlay(): Promise<PlaybackStatus>
  playbackPause(): Promise<PlaybackStatus>
  playbackStop(): Promise<PlaybackStatus>
  playbackSetTempo(multiplier: number): Promise<PlaybackStatus>
  playbackSetDryRun(dryRun: boolean): Promise<PlaybackStatus>
  playbackPanic(): Promise<PlaybackStatus>
  onPlaybackEvent(listener: (event: PlaybackEvent) => void): () => void
}
