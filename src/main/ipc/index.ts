import { dialog, ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AppSettings } from '@shared/settings'
import type { ConvertOptions } from '@shared/midi'
import type { ArrangeOptions } from '@shared/arranger'
import type { Song } from '@shared/song'
import { getSettings, setSettings, getLibrary } from '../store'
import { parseMidiFile, summarizeParsedMidi } from '../midi/parse'
import { convertMidiToSong } from '../midi/convert'
import { arrangeMidiToSong } from '../midi/arrange'
import { saveSong, loadSong, deleteSong, resolveDataFolder } from '../songFiles'
import { importExternalSheet } from '../importAdapters'
import { playbackScheduler } from '../scheduler/playback'
import { getMainWindow } from '../windowRef'
import { refreshGlobalHotkeys } from '../hotkeys'

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ping, async () => 'pong')

  ipcMain.handle(IPC_CHANNELS.getSettings, async () => getSettings())

  ipcMain.handle(IPC_CHANNELS.setSettings, async (_event, settings: AppSettings) => {
    await setSettings(settings)
    // Re-register global hotkeys immediately so a live Settings change takes
    // effect without an app restart (CLAUDE.md §8/§9).
    await refreshGlobalHotkeys()
  })

  ipcMain.handle(IPC_CHANNELS.pickDataFolder, async () => {
    const mainWindow = getMainWindow()
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.openDataFolder, async () => {
    const folder = await resolveDataFolder()
    await shell.openPath(folder)
  })

  ipcMain.handle(IPC_CHANNELS.listLibrary, async () => getLibrary())

  ipcMain.handle(IPC_CHANNELS.parseMidi, async (_event, buffer: ArrayBuffer) => {
    return summarizeParsedMidi(parseMidiFile(buffer))
  })

  ipcMain.handle(IPC_CHANNELS.convertMidi, async (_event, buffer: ArrayBuffer, options: ConvertOptions) => {
    return convertMidiToSong(parseMidiFile(buffer), options)
  })

  ipcMain.handle(IPC_CHANNELS.arrangeMidi, async (_event, buffer: ArrayBuffer, options: ArrangeOptions) => {
    return arrangeMidiToSong(parseMidiFile(buffer), options)
  })

  ipcMain.handle(IPC_CHANNELS.saveSong, async (_event, song: Song) => {
    return saveSong(song)
  })

  ipcMain.handle(IPC_CHANNELS.loadSong, async (_event, id: string) => {
    return loadSong(id)
  })

  ipcMain.handle(IPC_CHANNELS.deleteSong, async (_event, id: string) => {
    await deleteSong(id)
  })

  ipcMain.handle(IPC_CHANNELS.importSheet, async (_event, rawText: string, fileName: string) => {
    const song = importExternalSheet(rawText, fileName)
    await saveSong(song)
    return song
  })

  ipcMain.handle(IPC_CHANNELS.playbackLoad, async (_event, song: Song, dryRun: boolean) => {
    const settings = await getSettings()
    return playbackScheduler.load(song, settings.noteKeys, settings.minTapPressMs, dryRun)
  })

  ipcMain.handle(IPC_CHANNELS.playbackPlay, async () => {
    const status = playbackScheduler.play()
    if (!status.dryRun) getMainWindow()?.minimize()
    return status
  })

  ipcMain.handle(IPC_CHANNELS.playbackPause, async () => playbackScheduler.pause())

  ipcMain.handle(IPC_CHANNELS.playbackStop, async () => playbackScheduler.stop())

  ipcMain.handle(IPC_CHANNELS.playbackSetTempo, async (_event, multiplier: number) => {
    return playbackScheduler.setTempo(multiplier)
  })

  ipcMain.handle(IPC_CHANNELS.playbackSetDryRun, async (_event, dryRun: boolean) => {
    return playbackScheduler.setDryRun(dryRun)
  })

  ipcMain.handle(IPC_CHANNELS.playbackSeek, async (_event, timeMs: number) => {
    return playbackScheduler.seek(timeMs)
  })

  ipcMain.handle(IPC_CHANNELS.playbackPanic, async () => playbackScheduler.panic())

  playbackScheduler.onEvent((event) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.playbackEvent, event)
  })
}
