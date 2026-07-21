/**
 * Foreground-window safety guard: reports the OS-focused window title so the
 * playback scheduler can auto-pause if focus leaves the configured target
 * window (CLAUDE.md §9). get-windows (successor to active-win) is ESM-only;
 * this main process builds as CJS, so it's loaded via dynamic import.
 * TODO(build order step 6): wire into the playback scheduler.
 */
export async function getForegroundWindowTitle(): Promise<string | null> {
  const { activeWindow } = await import('get-windows')
  const result = await activeWindow()
  return result?.title ?? null
}
