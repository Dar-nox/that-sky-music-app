/**
 * Global transport hotkeys (CLAUDE.md §8/§9): registered via Electron's
 * built-in globalShortcut API so Play/Pause/Next/Previous/Panic work even
 * while the app window is minimized/hidden during playback. Re-registers
 * from scratch on every call, so a live Settings change takes effect
 * immediately without an app restart (see the setSettings IPC handler).
 */
import { globalShortcut } from 'electron'
import { getSettings } from './store'
import { nextTransport, panicTransport, playPauseTransport, previousTransport } from './transport'

export async function refreshGlobalHotkeys(): Promise<void> {
  // This app is the sole owner of global shortcuts, so unregistering everything
  // first (rather than tracking/replacing individual accelerators) is safe and
  // guarantees no stale binding survives under a since-changed key.
  globalShortcut.unregisterAll()

  const { transportHotkeys } = await getSettings()

  globalShortcut.register(transportHotkeys.playPause, () => {
    playPauseTransport().catch(() => {})
  })
  globalShortcut.register(transportHotkeys.next, () => {
    nextTransport().catch(() => {})
  })
  globalShortcut.register(transportHotkeys.previous, () => {
    previousTransport().catch(() => {})
  })
  globalShortcut.register(transportHotkeys.panic, () => {
    panicTransport().catch(() => {})
  })
}
