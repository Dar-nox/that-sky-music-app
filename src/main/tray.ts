/**
 * System tray icon + menu (CLAUDE.md §7/§9): the practical control surface
 * while the main window is minimized during playback. Right-click menu shows
 * the current song, a Play/Pause toggle reflecting live state, Next,
 * Previous, and Quit. Menu item clicks reuse the exact same transport
 * functions the global hotkeys call, so both control surfaces stay in sync
 * with no duplicated logic.
 */
import { app, Menu, Tray } from 'electron'
import { join } from 'node:path'
import { playbackScheduler } from './scheduler/playback'
import { getLibrary } from './store'
import { nextTransport, playPauseTransport, previousTransport } from './transport'

let tray: Tray | null = null

async function currentSongLabel(): Promise<string> {
  const status = playbackScheduler.getStatus()
  if (!status.songId) return 'No song loaded'

  const library = await getLibrary()
  const meta = library.find((entry) => entry.id === status.songId)
  return meta?.title ?? 'No song loaded'
}

async function rebuildMenu(): Promise<void> {
  if (!tray) return

  const status = playbackScheduler.getStatus()
  const songLabel = await currentSongLabel()

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: songLabel, enabled: false },
      { type: 'separator' },
      {
        label: status.state === 'playing' ? 'Pause' : 'Play',
        click: () => {
          playPauseTransport().catch(() => {})
        }
      },
      {
        label: 'Next',
        click: () => {
          nextTransport().catch(() => {})
        }
      },
      {
        label: 'Previous',
        click: () => {
          previousTransport().catch(() => {})
        }
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
}

/** Creates the tray icon and keeps its menu live as playback state changes. Call once at app startup. */
export function initTray(): void {
  if (tray) return

  tray = new Tray(join(__dirname, '../../resources/icon.ico'))
  tray.setToolTip('SkyKeys')
  rebuildMenu().catch(() => {})

  playbackScheduler.onEvent((event) => {
    if (event.type === 'status') rebuildMenu().catch(() => {})
  })
}
