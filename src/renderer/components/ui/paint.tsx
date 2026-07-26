import { cn } from './cn'

/**
 * The painted marks the interface is built from: a divider, a panel edge, and a
 * button daub.
 *
 * Three rules hold this together:
 *
 * 1. **Everything is an inline `<svg>`.** The renderer's CSP is
 *    `default-src 'self'` with no `img-src`, so a `data:` URI in a CSS
 *    `background-image` or `mask-image` would be blocked. Real SVG elements
 *    sidestep that entirely.
 * 2. **The irregularity is baked into the path data, not produced by a filter**,
 *    except for `PaintRule`. A filter is fine on one 12px-tall divider; running
 *    `feTurbulence` behind every button and panel on screen is exactly the kind
 *    of per-element cost this pass exists to remove.
 * 3. **Strokes use `vectorEffect="non-scaling-stroke"`**, because these shapes
 *    are drawn with `preserveAspectRatio="none"` so they can stretch to any box.
 *    Without it a wide, short panel would get a fat left edge and a hairline top.
 */

/* ---------------------------------------------------------------------------
 * Shared resources. Mounted once by AppShell.
 *
 * Deliberately separate from StarryBackground's `#sk-*` defs: at `plain`
 * background quality those aren't in the document at all, and the interface
 * still has to be able to draw itself.
 * ------------------------------------------------------------------------ */

export function UiPaintResources(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute">
      <defs>
        {/* A gentler impasto than the background's — a divider is read at arm's
            length, so the warp only needs to break the line's straightness. */}
        <filter
          id="ui-brush"
          x="-4%"
          y="-60%"
          width="108%"
          height="220%"
          filterUnits="objectBoundingBox"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.003 0.011" numOctaves={2} seed={19} result="warp" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="warp"
            scale={9}
            xChannelSelector="R"
            yChannelSelector="G"
            result="warped"
          />
          <feGaussianBlur in="warped" stdDeviation="0.7" />
        </filter>

        {/* Loaded in the middle, running dry at both ends — the shape of a
            single stroke pulled across the page. The taper is done entirely in
            the gradient's alpha: a dash pattern at this scale reads as a CSS
            dashed border, which is the opposite of the intent. */}
        <linearGradient id="ui-rule-ink" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-cobalt-500)" stopOpacity="0" />
          <stop offset="9%" stopColor="var(--color-cobalt-400)" stopOpacity="0.4" />
          <stop offset="31%" stopColor="var(--color-cobalt-300)" stopOpacity="0.62" />
          <stop offset="52%" stopColor="var(--color-star-400)" stopOpacity="0.72" />
          <stop offset="74%" stopColor="var(--color-cobalt-300)" stopOpacity="0.5" />
          <stop offset="91%" stopColor="var(--color-cobalt-500)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--color-cobalt-600)" stopOpacity="0" />
        </linearGradient>

        <linearGradient id="ui-daub-gold" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="var(--color-star-300)" />
          <stop offset="55%" stopColor="var(--color-star-400)" />
          <stop offset="100%" stopColor="var(--color-star-600)" />
        </linearGradient>

        <linearGradient id="ui-daub-vermilion" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="var(--color-vermilion-500)" />
          <stop offset="100%" stopColor="var(--color-vermilion-700)" />
        </linearGradient>

        <linearGradient id="ui-daub-cypress" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="var(--color-cypress-500)" />
          <stop offset="100%" stopColor="var(--color-cypress-700)" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/* ---------------------------------------------------------------------------
 * PaintRule — the section divider
 * ------------------------------------------------------------------------ */

/**
 * Two passes of one gesture: a continuous loaded bed, and a thin dry flick
 * riding above it that skips in places the way a brush does when the paint runs
 * out. Only the flick is broken — the bed is unbroken, which is what keeps the
 * whole thing reading as a stroke rather than as a dashed border.
 *
 * The viewBox is deliberately tall relative to the rendered height: the warp
 * filter needs vertical room to bend the line, and a 14-unit-tall box flattened
 * it to nothing.
 */
const RULE_PATH = 'M 4 15 C 190 7, 386 21, 596 13 C 772 7, 962 20, 1196 11'
const RULE_FLICK = 'M 96 11 C 322 18, 528 8, 742 16 C 902 21, 1046 10, 1148 15'

export function PaintRule({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={cn('block h-5 w-full', className)}
      viewBox="0 0 1200 28"
      preserveAspectRatio="none"
      role="presentation"
    >
      <g fill="none" filter="url(#ui-brush)">
        <path d={RULE_PATH} stroke="url(#ui-rule-ink)" strokeWidth={3.4} strokeLinecap="round" />
        <path
          d={RULE_FLICK}
          stroke="var(--color-star-300)"
          strokeWidth={1.1}
          strokeLinecap="round"
          strokeDasharray="230 180 150 260 190"
          opacity={0.3}
        />
      </g>
    </svg>
  )
}

/* ---------------------------------------------------------------------------
 * PaintFrame — the uneven edge of the one panel this UI allows
 * ------------------------------------------------------------------------ */

/**
 * A rectangle blocked in by hand: no corner is square and no edge is straight.
 * Drawn in a nominal 400x300 box and stretched to fit.
 *
 * The path runs right up against the edges of its viewBox, and the gap between
 * the frame and the panel's own edge comes from a *fixed pixel* inset on the
 * `<svg>` instead. That is load-bearing. When the gap was baked into the path
 * — the frame sitting 8 units inside a 400-unit box — `preserveAspectRatio="none"`
 * turned it into a percentage: on a 730px-wide plate the stroke landed ~15px in,
 * against 20px of padding, leaving 5px of clearance and reading as if the panel
 * had no padding at all. Anything that should be a constant distance from the
 * element's edge has to live in CSS, not in the path data.
 *
 * The stroke is also *continuous*. An earlier version dashed it, which at real
 * panel sizes stopped reading as a lifted brush and started reading as a
 * rendering fault — broken corners look like a bug, not a gesture. Deviations
 * stay small (3-5 units) because the stretch multiplies them too.
 */
const FRAME_PATH =
  'M 2 5 C 98 2, 216 7, 312 3 C 350 2, 378 4, 397 6 ' +
  'C 399 98, 394 197, 397 294 ' +
  'C 301 297, 179 293, 77 296 C 43 297, 19 296, 2 294 ' +
  'C 0 201, 5 103, 2 5 Z'

export interface PaintFrameProps {
  /** Any CSS colour; defaults to the cobalt used by `Plate`. */
  stroke?: string
  strokeOpacity?: number
  /** Break the edge into long daubs — used by `DropZone`, the one place an open
   *  boundary means something. Kept to long marks with short gaps so it still
   *  reads as paint rather than as a CSS dashed border. */
  broken?: boolean
  className?: string
}

export function PaintFrame({
  stroke = 'var(--color-cobalt-500)',
  strokeOpacity = 0.32,
  broken = false,
  className
}: PaintFrameProps): React.JSX.Element {
  return (
    // The inset lives on a plain `<div>`, not on the `<svg>`. An `<svg>` is a
    // replaced element: give it four insets and no explicit size and it resolves
    // its height from the viewBox's intrinsic ratio rather than stretching, which
    // left the frame's bottom edge 10px shy of where it belonged. A div stretches.
    <div aria-hidden="true" className={cn('pointer-events-none absolute inset-[5px]', className)}>
      <svg className="h-full w-full" viewBox="0 0 400 300" preserveAspectRatio="none" role="presentation">
        <path
          d={FRAME_PATH}
          fill="none"
          stroke={stroke}
          strokeOpacity={strokeOpacity}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeDasharray={broken ? '58 14 96 16 74 12' : undefined}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * PaintDaub — the filled shape behind a primary button
 * ------------------------------------------------------------------------ */

export type DaubTone = 'gold' | 'vermilion' | 'cypress'

const DAUB_FILL: Record<DaubTone, string> = {
  gold: 'url(#ui-daub-gold)',
  vermilion: 'url(#ui-daub-vermilion)',
  cypress: 'url(#ui-daub-cypress)'
}

/** A single loaded press of the brush — swollen in the middle, tapering at the
 *  ends, with the top edge a little proud of the bottom. */
const DAUB_PATH =
  'M 9 21 C 6 12, 16 5, 30 4 C 62 1, 98 2, 132 4 ' +
  'C 148 5, 155 11, 154 21 C 153 30, 146 36, 131 37 ' +
  'C 96 39, 58 38, 28 36 C 14 35, 11 29, 9 21 Z'

export function PaintDaub({ tone, className }: { tone: DaubTone; className?: string }): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
      viewBox="0 0 164 42"
      preserveAspectRatio="none"
      role="presentation"
    >
      <path d={DAUB_PATH} fill={DAUB_FILL[tone]} />
      {/* The wet highlight where the brush first touched down. */}
      <path
        d="M 22 11 C 52 7, 104 7, 140 10"
        fill="none"
        stroke="var(--color-moon-50)"
        strokeOpacity={0.28}
        strokeWidth={2}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
