import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AppSettings } from '@shared/settings'
import type { ConvertOptions } from '@shared/midi'
import type { Song } from '@shared/song'
import { getSettings, setSettings, getLibrary } from '../store'
import { parseMidiFile, summarizeParsedMidi } from '../midi/parse'
import { convertMidiToSong } from '../midi/convert'
import { saveSong, loadSong } from '../songFiles'
import { playbackScheduler } from '../scheduler/playback'
import { getMainWindow } from '../windowRef'

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

  ipcMain.handle(IPC_CHANNELS.loadSong, async (_event, id: string) => {
    return loadSong(id)
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

  ipcMain.handle(IPC_CHANNELS.playbackPanic, async () => playbackScheduler.panic())

  playbackScheduler.onEvent((event) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.playbackEvent, event)
  })
}
