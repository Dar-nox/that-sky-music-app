import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type SkyAPI } from '@shared/ipc'
import type { AppSettings } from '@shared/settings'
import type { ConvertOptions } from '@shared/midi'
import type { Song } from '@shared/song'

const skyAPI: SkyAPI = {
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.ping),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  setSettings: (settings: AppSettings) => ipcRenderer.invoke(IPC_CHANNELS.setSettings, settings),
  listLibrary: () => ipcRenderer.invoke(IPC_CHANNELS.listLibrary),
  parseMidi: (buffer: ArrayBuffer) => ipcRenderer.invoke(IPC_CHANNELS.parseMidi, buffer),
  convertMidi: (buffer: ArrayBuffer, options: ConvertOptions) =>
    ipcRenderer.invoke(IPC_CHANNELS.convertMidi, buffer, options),
  saveSong: (song: Song) => ipcRenderer.invoke(IPC_CHANNELS.saveSong, song)
}

contextBridge.exposeInMainWorld('skyAPI', skyAPI)
