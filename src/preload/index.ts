import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type SkyAPI } from '@shared/ipc'
import type { AppSettings } from '@shared/settings'

const skyAPI: SkyAPI = {
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.ping),
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  setSettings: (settings: AppSettings) => ipcRenderer.invoke(IPC_CHANNELS.setSettings, settings),
  listLibrary: () => ipcRenderer.invoke(IPC_CHANNELS.listLibrary)
}

contextBridge.exposeInMainWorld('skyAPI', skyAPI)
