/**
 * Geometry and stroke data for the Starry Night background.
 *
 * Kept out of the component and hard-coded (never randomised) so the painting is
 * byte-identical on every mount — the background is memoised and must never
 * re-compose itself while the app is running.
 *
 * The important idea: a Van Gogh swirl is *not* one smooth spiral. It is many
 * near-parallel passes of a loaded brush in neighbouring hues. So each swirl is
 * one shared `<path>` in `<defs>` re-drawn as several offset "ribbons" of
 * differing width, colour and dash pattern. `stroke-linecap="round"` plus a
 * dash pattern turns each pass into a run of discrete lozenge-shaped daubs.
 */

export type SwirlId = 'a' | 'b' | 'c' | 'd'

/** The four brush gestures, in a 1200x800 viewBox. */
export const SWIRL_PATHS: Record<SwirlId, string> = {
  // Big counter-clockwise vortex, lower left — the painting's dominant gesture.
  a: 'M -160 520 C 40 330, 320 330, 420 480 S 340 780, 160 706 S 60 430, 320 412 S 540 566, 424 706',
  // Tighter clockwise eddy, upper right.
  b: 'M 1400 180 C 1160 60, 900 180, 880 350 S 1080 560, 1200 460 S 1220 250, 1000 262',
  // High sweep across the top — the sky's flow line.
  c: 'M -120 130 C 220 50, 470 150, 770 88 S 1180 30, 1420 122',
  // Low band near the horizon, ochre-tinted like the village.
  d: 'M -100 690 C 220 620, 420 760, 700 690 S 1080 600, 1360 676'
}

export interface Ribbon {
  swirl: SwirlId
  /** Stroke width. Wide = the loaded base coat, narrow = the final flick. */
  width: number
  color: string
  /** Dash pattern — this is what breaks a line into brush daubs. */
  dash: string
  offset: number
  opacity: number
  /** Perpendicular-ish nudge, so passes sit alongside rather than on top. */
  dy: number
}

/**
 * Base coat: the broad, dark bed the brighter passes are laid over. Wide but
 * soft and low-contrast, so it reads as atmosphere rather than as an object.
 *
 * Dash rule of thumb throughout: the dab must be several times the stroke
 * width, and the gap roughly half the dab. Short dashes on a wide stroke read
 * as stippling/gravel; long dashes with round caps read as a loaded brush.
 */
export const DEEP_RIBBONS: Ribbon[] = [
  { swirl: 'a', width: 22, color: 'var(--color-cobalt-800)', dash: '150 44 96 58', offset: 0, opacity: 0.8, dy: 17 },
  { swirl: 'a', width: 16, color: 'var(--color-night-700)', dash: '118 50 74 44', offset: 40, opacity: 0.62, dy: 2 },
  { swirl: 'a', width: 11, color: 'var(--color-cobalt-700)', dash: '96 46 62 40', offset: 95, opacity: 0.5, dy: -12 },
  { swirl: 'b', width: 20, color: 'var(--color-cobalt-800)', dash: '138 46 88 54', offset: 15, opacity: 0.78, dy: 15 },
  { swirl: 'b', width: 13, color: 'var(--color-night-700)', dash: '106 48 70 42', offset: 62, opacity: 0.55, dy: 0 },
  { swirl: 'c', width: 17, color: 'var(--color-night-700)', dash: '176 62 112 70', offset: 0, opacity: 0.6, dy: 12 },
  { swirl: 'c', width: 10, color: 'var(--color-cobalt-800)', dash: '134 56 84 50', offset: 58, opacity: 0.46, dy: -4 },
  { swirl: 'd', width: 18, color: 'var(--color-cypress-800)', dash: '148 58 94 62', offset: 20, opacity: 0.66, dy: 10 },
  { swirl: 'd', width: 11, color: 'var(--color-cypress-700)', dash: '116 52 76 46', offset: 74, opacity: 0.44, dy: -4 }
]

/**
 * Mid coat: the lit blues that actually read as the swirl. This is the one
 * layer that slowly rotates.
 */
export const MID_RIBBONS: Ribbon[] = [
  { swirl: 'a', width: 8, color: 'var(--color-cobalt-600)', dash: '84 40 52 46', offset: 25, opacity: 0.6, dy: -23 },
  { swirl: 'a', width: 5.5, color: 'var(--color-cobalt-500)', dash: '64 44 40 48', offset: 72, opacity: 0.46, dy: -32 },
  { swirl: 'a', width: 3.5, color: 'var(--color-cobalt-300)', dash: '44 50 28 54', offset: 12, opacity: 0.3, dy: -40 },
  { swirl: 'b', width: 7.5, color: 'var(--color-cobalt-600)', dash: '78 38 50 44', offset: 10, opacity: 0.56, dy: -21 },
  { swirl: 'b', width: 5, color: 'var(--color-cobalt-500)', dash: '60 42 38 46', offset: 54, opacity: 0.42, dy: -30 },
  { swirl: 'b', width: 3.5, color: 'var(--color-cobalt-200)', dash: '40 48 26 52', offset: 30, opacity: 0.26, dy: -37 }
]

/**
 * Top coat: the sparse gold and cream flicks that catch the moonlight, plus the
 * ochre horizon band. Kept few and thin — these are the last marks a painter
 * makes, not the bulk of the picture.
 */
export const TOP_RIBBONS: Ribbon[] = [
  { swirl: 'a', width: 2.5, color: 'var(--color-star-300)', dash: '26 74 14 96', offset: 40, opacity: 0.36, dy: -47 },
  { swirl: 'b', width: 2.5, color: 'var(--color-star-400)', dash: '22 78 12 92', offset: 18, opacity: 0.34, dy: -44 },
  { swirl: 'c', width: 6, color: 'var(--color-cobalt-600)', dash: '88 52 56 60', offset: 30, opacity: 0.4, dy: -17 },
  { swirl: 'c', width: 2.5, color: 'var(--color-star-300)', dash: '26 86 14 98', offset: 60, opacity: 0.3, dy: -27 },
  { swirl: 'd', width: 6, color: 'var(--color-cypress-600)', dash: '92 54 58 62', offset: 34, opacity: 0.4, dy: -15 },
  { swirl: 'd', width: 3, color: 'var(--color-ochre-500)', dash: '30 84 16 96', offset: 10, opacity: 0.34, dy: -25 }
]

export interface PaintedStarSpec {
  x: number
  y: number
  scale: number
}

/**
 * Three groups so they can twinkle out of phase with one another. Positions are
 * chosen to sit in the gaps between swirls, and to stay clear of the sidebar.
 */
export const STAR_GROUPS: PaintedStarSpec[][] = [
  [
    { x: 1042, y: 128, scale: 1.5 },
    { x: 300, y: 176, scale: 0.85 },
    { x: 706, y: 268, scale: 0.6 },
    { x: 1148, y: 604, scale: 0.72 }
  ],
  [
    { x: 560, y: 96, scale: 1.05 },
    { x: 878, y: 470, scale: 0.66 },
    { x: 150, y: 300, scale: 0.62 },
    { x: 990, y: 700, scale: 0.9 }
  ],
  [
    { x: 250, y: 610, scale: 0.7 },
    { x: 640, y: 590, scale: 1.2 },
    { x: 1300, y: 330, scale: 0.8 },
    { x: 430, y: 250, scale: 0.55 },
    { x: 800, y: 730, scale: 0.5 }
  ]
]

/** The crescent moon, upper right — the painting's other light source. */
export const MOON = { x: 1096, y: 150, r: 52 }
