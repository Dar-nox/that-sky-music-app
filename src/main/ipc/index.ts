import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AppSettings } from '@shared/settings'
import { getSettings, setSettings, getLibrary } from '../store'

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ping, async () => 'pong')

  ipcMain.handle(IPC_CHANNELS.getSettings, async () => getSettings())

  ipcMain.handle(IPC_CHANNELS.setSettings, async (_event, settings: AppSettings) => {
    await setSettings(settings)
  })

  ipcMain.handle(IPC_CHANNELS.listLibrary, async () => getLibrary())
}
