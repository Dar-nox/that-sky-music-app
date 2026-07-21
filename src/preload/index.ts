import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC_CHANNELS, type SkyAPI } from '@shared/ipc'
import type { AppSettings } from '@shared/settings'
import type { ConvertOptions } from '@shared/midi'
import type { PlaybackEvent } from '@shared/playback'
import type { Song } from '@shared/song'

const skyAPI: SkyAPI = {
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.ping),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  setSettings: (settings: AppSettings) => ipcRenderer.invoke(IPC_CHANNELS.setSettings, settings),
  pickDataFolder: () => ipcRenderer.invoke(IPC_CHANNELS.pickDataFolder),
  openDataFolder: () => ipcRenderer.invoke(IPC_CHANNELS.openDataFolder),
  listLibrary: () => ipcRenderer.invoke(IPC_CHANNELS.listLibrary),
  parseMidi: (buffer: ArrayBuffer) => ipcRenderer.invoke(IPC_CHANNELS.parseMidi, buffer),
  convertMidi: (buffer: ArrayBuffer, options: ConvertOptions) =>
    ipcRenderer.invoke(IPC_CHANNELS.convertMidi, buffer, options),
  saveSong: (song: Song) => ipcRenderer.invoke(IPC_CHANNELS.saveSong, song),
  loadSong: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.loadSong, id),
  importSheet: (rawText: string, fileName: string) => ipcRenderer.invoke(IPC_CHANNELS.importSheet, rawText, fileName),
  playbackLoad: (song: Song, dryRun: boolean) => ipcRenderer.invoke(IPC_CHANNELS.playbackLoad, song, dryRun),
  playbackPlay: () => ipcRenderer.invoke(IPC_CHANNELS.playbackPlay),
  playbackPause: () => ipcRenderer.invoke(IPC_CHANNELS.playbackPause),
  playbackStop: () => ipcRenderer.invoke(IPC_CHANNELS.playbackStop),
  playbackSetTempo: (multiplier: number) => ipcRenderer.invoke(IPC_CHANNELS.playbackSetTempo, multiplier),
  playbackSetDryRun: (dryRun: boolean) => ipcRenderer.invoke(IPC_CHANNELS.playbackSetDryRun, dryRun),
  playbackSeek: (timeMs: number) => ipcRenderer.invoke(IPC_CHANNELS.playbackSeek, timeMs),
  playbackPanic: () => ipcRenderer.invoke(IPC_CHANNELS.playbackPanic),
  onPlaybackEvent: (listener: (event: PlaybackEvent) => void) => {
    const handler = (_event: IpcRendererEvent, payload: PlaybackEvent): void => listener(payload)
    ipcRenderer.on(IPC_CHANNELS.playbackEvent, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.playbackEvent, handler)
  }
}

contextBridge.exposeInMainWorld('skyAPI', skyAPI)
