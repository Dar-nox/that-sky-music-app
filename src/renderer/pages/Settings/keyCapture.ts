/**
 * Translates a captured browser KeyboardEvent into the key-name string format
 * used throughout Settings/store: uppercase single letters or the literal
 * punctuation character for note keys (matches `src/main/keystroke/sender.ts`'s
 * KEY_NAME_TO_NUT_KEY table), and Electron-accelerator-compatible names
 * ('Space', 'Left', 'Right', 'Escape', ...) for transport hotkeys (matches
 * `src/main/hotkeys.ts`, which registers these strings directly via
 * Electron's globalShortcut API).
 *
 * The same translation works for both note keys and transport hotkeys since
 * the accepted name sets overlap (e.g. nothing stops a note key being bound
 * to 'Space' too) - callers don't need two separate capture paths.
 */

const SPECIAL_KEY_NAMES: Record<string, string> = {
  ' ': 'Space',
  ArrowRight: 'Right',
  ArrowLeft: 'Left',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  Escape: 'Escape'
}

/** Pure modifier keypresses don't count as a capture on their own. */
const IGNORED_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'])

export function captureKeyName(event: Pick<KeyboardEvent, 'key'>): string | null {
  const { key } = event
  if (IGNORED_KEYS.has(key)) return null
  if (key in SPECIAL_KEY_NAMES) return SPECIAL_KEY_NAMES[key]
  if (key.length === 1) return key.toUpperCase()
  // Falls through for things like 'F1'-'F12', 'Enter', 'Backspace' - these
  // already match Electron's accelerator key-name format as-is.
  return key
}
