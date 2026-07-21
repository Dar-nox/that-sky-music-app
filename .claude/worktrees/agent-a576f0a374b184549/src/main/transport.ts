/**
 * Main-process transport logic (CLAUDE.md §7/§8) shared by the global
 * hotkeys and the tray menu, so both control surfaces work identically while
 * the app window is minimized/hidden. Previously Play Music Mode's Prev/Next
 * only existed as renderer React state driving IPC calls directly; this is
 * the main-process equivalent so the same actions also work as global
 * hotkeys and tray clicks.
 */
import type { SongMeta } from '@shared/song'
import { playbackScheduler } from './scheduler/playback'
import { getLibrary, getSettings } from './store'
import { loadSong } from './songFiles'
import { getMainWindow } from './windowRef'

/**
 * Pure index math for Next/Previous navigation: given the library order and
 * the currently loaded song id, resolves the adjacent song id with
 * wraparound. Extracted as a pure function so it's unit-testable without
 * touching Electron APIs. Returns null for an empty library. If the current
 * id isn't found in the library (e.g. nothing loaded yet), `next` starts at
 * the first song and `previous` starts at the last.
 */
export function resolveAdjacentSongId(
  library: SongMeta[],
  currentId: string | null,
  direction: 1 | -1
): string | null {
  if (library.length === 0) return null

  const currentIndex = currentId ? library.findIndex((entry) => entry.id === currentId) : -1
  if (currentIndex === -1) {
    return direction === 1 ? library[0].id : library[library.length - 1].id
  }

  const nextIndex = (currentIndex + direction + library.length) % library.length
  return library[nextIndex].id
}

/** Global panic hotkey (CLAUDE.md §9): hard-stops all pending keystrokes. */
export async function panicTransport(): Promise<void> {
  playbackScheduler.panic()
}

/**
 * Global/tray Play-Pause toggle. Unlike the renderer's Play button, a
 * mid-session hotkey toggle doesn't show the countdown — that's cold-start
 * UX handled in the renderer. Mirrors the existing playbackPlay IPC
 * handler's minimize-on-play behavior when leaving dry-run mode.
 */
export async function playPauseTransport(): Promise<void> {
  const status = playbackScheduler.getStatus()

  if (status.state === 'playing') {
    playbackScheduler.pause()
    return
  }

  try {
    const next = playbackScheduler.play()
    if (!next.dryRun) getMainWindow()?.minimize()
  } catch {
    // No song loaded yet — a stray hotkey/tray click is a no-op rather than a crash.
  }
}

async function loadAdjacent(direction: 1 | -1): Promise<void> {
  const [library, settings] = await Promise.all([getLibrary(), getSettings()])
  const status = playbackScheduler.getStatus()

  const targetId = resolveAdjacentSongId(library, status.songId, direction)
  if (!targetId) return

  const song = await loadSong(targetId)
  playbackScheduler.load(song, settings.noteKeys, settings.minTapPressMs, status.dryRun)
}

/** Loads the next song in library order without auto-playing it (matches the renderer's Next button). */
export async function nextTransport(): Promise<void> {
  await loadAdjacent(1)
}

/** Loads the previous song in library order without auto-playing it (matches the renderer's Previous button). */
export async function previousTransport(): Promise<void> {
  await loadAdjacent(-1)
}
