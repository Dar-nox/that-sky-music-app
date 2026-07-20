import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AppSettings } from '@shared/settings'
import type { ConvertOptions } from '@shared/midi'
import type { Song } from '@shared/song'
import { getSettings, setSettings, getLibrary } from '../store'
import { parseMidiFile, summarizeParsedMidi } from '../midi/parse'
import { convertMidiToSong } from '../midi/convert'
import { saveSong } from '../songFiles'

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ping, async () => 'pong')

  ipcMain.handle(IPC_CHANNELS.getSettings, async () => getSettings())

  ipcMain.handle(IPC_CHANNELS.setSettings, async (_event, settings: AppSettings) => {
    await setSettings(settings)
  })

  ipcMain.handle(IPC_CHANNELS.listLibrary, async () => getLibrary())

  ipcMain.handle(IPC_CHANNELS.parseMidi, async (_event, buffer: ArrayBuffer) => {
    return summarizeParsedMidi(parseMidiFile(buffer))
  })

  ipcMain.handle(IPC_CHANNELS.convertMidi, async (_event, buffer: ArrayBuffer, options: ConvertOptions) => {
    return convertMidiToSong(parseMidiFile(buffer), options)
  })

  ipcMain.handle(IPC_CHANNELS.saveSong, async (_event, song: Song) => {
    return saveSong(song)
  })
}
