/**
 * Active-window safety guard (CLAUDE.md §9): while the scheduler is playing
 * (and not in dry-run mode, since dry-run never sends real OS input), polls
 * the OS-focused window title roughly every second. If focus has left the
 * configured target window, auto-pauses playback and reports it to the
 * renderer by reusing the existing 'error' PlaybackEvent — no new event type
 * needed, and this stays main-process-only (doesn't touch shared/ipc.ts).
 *
 * The poll only runs while actually playing: it starts/stops itself by
 * subscribing to the scheduler's own status events, rather than running
 * unconditionally on a global interval.
 */
import { IPC_CHANNELS } from '@shared/ipc'
import { playbackScheduler } from '../scheduler/playback'
import { getSettings } from '../store'
import { getMainWindow } from '../windowRef'
import { getForegroundWindowTitle } from './windowGuard'

const POLL_MS = 1000

let pollTimer: ReturnType<typeof setInterval> | null = null

/**
 * Case-insensitive substring match between the OS-reported foreground window
 * title and the configured target window title. Pulled out as a pure
 * function so it's unit-testable without touching Electron/get-windows. A
 * blank configured target is treated as "no restriction configured" and
 * always matches; a null foreground title (target focus undetectable) is
 * treated as *not* matching, erring toward pausing rather than staying silent.
 */
export function isTargetWindowFocused(foregroundTitle: string | null, targetWindowTitle: string): boolean {
  if (!targetWindowTitle.trim()) return true
  if (!foregroundTitle) return false
  return foregroundTitle.toLowerCase().includes(targetWindowTitle.toLowerCase())
}

async function pollOnce(): Promise<void> {
  const settings = await getSettings()
  const title = await getForegroundWindowTitle()

  if (!isTargetWindowFocused(title, settings.targetWindowTitle)) {
    playbackScheduler.pause()
    getMainWindow()?.webContents.send(IPC_CHANNELS.playbackEvent, {
      type: 'error',
      message: `Paused: focus left the "${settings.targetWindowTitle}" window`
    })
  }
}

function startPolling(): void {
  if (pollTimer !== null) return
  pollTimer = setInterval(() => {
    pollOnce().catch(() => {
      // A single failed OS/settings read shouldn't kill the guard; just try again next tick.
    })
  }, POLL_MS)
}

function stopPolling(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/**
 * Wires the guard to start/stop in step with playback state. Call once at
 * app startup (CLAUDE.md §11 build order step 6).
 */
export function initActiveWindowGuard(): void {
  playbackScheduler.onEvent((event) => {
    if (event.type !== 'status') return
    if (event.status.state === 'playing' && !event.status.dryRun) {
      startPolling()
    } else {
      stopPolling()
    }
  })
}
