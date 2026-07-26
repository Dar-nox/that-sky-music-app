import { DEFAULT_NOTE_KEYS, DEFAULT_TRANSPORT_HOTKEYS, type NoteKeyMap, type TransportAction } from './keybinds'

/**
 * How much of the painted backdrop to render.
 *
 * The painting's brush texture comes from `feTurbulence` + `feDisplacementMap`,
 * which Skia has no GPU path for. All three levels measure the same frame time
 * (see `StarryBackground.tsx`); what differs is graphics memory and motion.
 *
 * - `painting` — every coat baked to an image at startup and animated as a
 *   promoted layer. Three window-sized textures.
 * - `still`    — every coat, live SVG, nothing animated. The filters run at
 *   first paint and never again, and no layer is promoted. Default, because it
 *   is the one that asks nothing of an old iGPU.
 * - `plain`    — the gradient wash alone. No SVG, no filters at all.
 */
export type BackgroundQuality = 'painting' | 'still' | 'plain'

export interface AppSettings {
  noteKeys: NoteKeyMap
  transportHotkeys: Record<TransportAction, string>
  /** Notes held longer than this become `hold: true` during conversion. */
  sustainThresholdMs: number
  /** Floor applied to tap keydown->keyup duration so short presses aren't dropped by the OS/game. */
  minTapPressMs: number
  countdownSeconds: number
  targetWindowTitle: string
  dataFolder: string | null
  backgroundQuality: BackgroundQuality
}

export const DEFAULT_SETTINGS: AppSettings = {
  noteKeys: DEFAULT_NOTE_KEYS,
  transportHotkeys: DEFAULT_TRANSPORT_HOTKEYS,
  sustainThresholdMs: 300,
  minTapPressMs: 50,
  countdownSeconds: 3,
  targetWindowTitle: 'Sky',
  dataFolder: null,
  backgroundQuality: 'still'
}
