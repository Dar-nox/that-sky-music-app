import { memo, useEffect, useState } from 'react'
import type { BackgroundQuality } from '@shared/settings'
import { bakeLayer } from './bake'
import {
  DEEP_RIBBONS,
  MID_RIBBONS,
  MOON,
  STAR_GROUPS,
  SWIRL_PATHS,
  TOP_RIBBONS,
  type PaintedStarSpec,
  type Ribbon
} from './paintData'

/**
 * The Starry Night backdrop.
 *
 * ## Why this is shaped the way it is
 *
 * The brush texture comes from `feTurbulence` -> `feDisplacementMap` ->
 * `feGaussianBlur`. Skia has no GPU path for `feTurbulence`, so that chain is
 * CPU work over the whole window — fine once, ruinous per frame.
 *
 * Two approaches were tried and measured before this one. Median frame time,
 * idle on the Convert page:
 *
 *   - Every animated group inside one `<svg>`, with the animation on an
 *     unfiltered ancestor `<g>`: 66.6 ms. Blink does not promote SVG
 *     *descendants* to compositor layers, so `will-change` on a `<g>` buys
 *     nothing and animating one invalidated the whole `<svg>`'s paint.
 *   - Each coat moved into its own promoted `<div>`, still as live SVG: also
 *     66.6 ms — and 33.2 ms with the filters stripped out entirely. Promotion
 *     alone does not give you a cached texture when the layer's contents are
 *     SVG DOM; the geometry gets re-rastered as the layer moves, and these are
 *     wide dashed round-capped strokes, which are not cheap to rasterize.
 *
 * What works is `bake.ts`: serialize each coat to a standalone SVG *image*
 * once, and animate elements that merely display it. An image has a cached
 * raster, so moving it is real compositor work. That is 16.6 ms — 60 fps, and
 * indistinguishable from the static modes.
 *
 * Rules this file must keep to:
 *   - Never animate an element whose contents are live SVG. Animate baked
 *     layers, and nothing else.
 *   - Only `transform` and `opacity` are animated, and transform stays to
 *     translate. A `scale` or `rotate` animation makes the image re-rasterize
 *     at the new geometry.
 *   - Animated layers are oversized (negative inset) so translating them never
 *     drags an empty edge into view.
 *   - The component is wrapped in `memo` and holds only the baked URLs, so
 *     React effectively never re-renders it. Playback fires note events
 *     ~20x/second while it's onscreen.
 */

/** Read once at module scope — this also drops `will-change` hints, which the
 *  CSS-only reduced-motion rule in globals.css can't do. */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const VIEW_BOX = '0 0 1200 800'

/**
 * Two star layers rather than the source data's three: each one is a promoted
 * compositor layer the size of the window, and on the integrated GPUs this app
 * targets that memory is worth more than a third twinkle phase. Splitting by
 * index keeps every star and keeps the two sets spatially interleaved.
 */
const ALL_STARS = STAR_GROUPS.flat()
const STAR_LAYERS: PaintedStarSpec[][] = [
  ALL_STARS.filter((_, i) => i % 2 === 0),
  ALL_STARS.filter((_, i) => i % 2 === 1)
]

function motion(className: string): string | undefined {
  return PREFERS_REDUCED_MOTION ? undefined : className
}

/* ---------------------------------------------------------------------------
 * Shared resources
 *
 * Filters and gradients are referenced by document-global URL fragment, so they
 * live once in a zero-size hidden `<svg>` and every layer points at them. The
 * swirl geometry is *not* shared via `<use>` — cross-`<svg>`-root `<use>` is a
 * murkier corner of the spec than a plain `url(#id)` resource reference, and
 * with ~21 ribbons total there is nothing to gain by sharing it.
 * ------------------------------------------------------------------------ */

function PaintResources(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute">
      <PaintDefs />
    </svg>
  )
}

/** The filters and gradients themselves. Rendered into the page once by
 *  `PaintResources` for the live modes, and *also* inlined into every baked
 *  layer — a baked layer is a standalone document and cannot reach back into
 *  the page for its resources. */
function PaintDefs(): React.JSX.Element {
  return (
    <defs>
        {/*
          The brush filter.

          The trick is LOW-frequency, HIGH-amplitude displacement: a slow, lazy
          warp bends each stroke along its length the way a loaded brush
          wanders, then a generous blur softens the edge into wet paint.

          High-frequency noise (or a specular "canvas tooth" pass) is what makes
          this read as gravel/lichen instead of oil — so there is deliberately
          none of it here. What sells the brush is the geometry: many parallel
          passes, round caps, and long dashes that break each pass into
          comma-shaped daubs.

          colorInterpolationFilters="sRGB" is deliberate — the linearRGB default
          is slower and desaturates the golds.
        */}
        <filter
          id="sk-impasto"
          x="-25%"
          y="-25%"
          width="150%"
          height="150%"
          filterUnits="objectBoundingBox"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.005 0.013"
            numOctaves={2}
            seed={7}
            result="warp"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="warp"
            scale={13}
            xChannelSelector="R"
            yChannelSelector="G"
            result="warped"
          />
          {/* Enough blur to soften the daub ends into wet paint, not so much
              that adjacent daubs smear into one continuous band. */}
          <feGaussianBlur in="warped" stdDeviation="2.6" />
        </filter>

        {/* Softer variant for the small marks (stars, moon), which would be
            swallowed whole by the swirl-scale warp. */}
        <filter
          id="sk-impasto-fine"
          x="-40%"
          y="-40%"
          width="180%"
          height="180%"
          filterUnits="objectBoundingBox"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.03"
            numOctaves={2}
            seed={5}
            result="warp"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="warp"
            scale={2.5}
            xChannelSelector="R"
            yChannelSelector="G"
            result="warped"
          />
          <feGaussianBlur in="warped" stdDeviation="0.6" />
        </filter>

        {/* Linen-canvas tooth — very faint, purely to kill gradient banding. */}
        <filter id="sk-canvas" x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves={3}
            seed={11}
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>

        <radialGradient id="sk-moon-glow">
          <stop offset="0%" stopColor="var(--color-star-200)" stopOpacity="0.5" />
          <stop offset="55%" stopColor="var(--color-star-400)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--color-star-400)" stopOpacity="0" />
        </radialGradient>

        <radialGradient id="sk-star-glow">
          <stop offset="0%" stopColor="var(--color-star-300)" stopOpacity="0.42" />
          <stop offset="45%" stopColor="var(--color-star-500)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="var(--color-star-500)" stopOpacity="0" />
        </radialGradient>
    </defs>
  )
}

/* ---------------------------------------------------------------------------
 * The marks themselves
 * ------------------------------------------------------------------------ */

/**
 * Per-coat dimming.
 *
 * The stroke opacities in `paintData` were tuned when every piece of text in
 * the app sat inside an opaque panel. In an unboxed layout the type sits
 * directly on the paint, so the lit cobalt passes have to come down or they
 * read as glowing tubes behind the words. Applied here as one group opacity per
 * coat rather than by editing the ribbon data, so the painting's internal
 * balance is untouched and there is a single number to turn.
 */
const COAT_OPACITY = { deep: 0.72, mid: 0.44, top: 0.6 } as const

function Ribbons({ ribbons, coat }: { ribbons: Ribbon[]; coat: keyof typeof COAT_OPACITY }): React.JSX.Element {
  return (
    <g fill="none" filter="url(#sk-impasto)" opacity={COAT_OPACITY[coat]}>
      {ribbons.map((ribbon, i) => (
        <path
          key={i}
          d={SWIRL_PATHS[ribbon.swirl]}
          transform={`translate(0 ${ribbon.dy})`}
          stroke={ribbon.color}
          strokeWidth={ribbon.width}
          strokeDasharray={ribbon.dash}
          strokeDashoffset={ribbon.offset}
          strokeLinecap="round"
          opacity={ribbon.opacity}
        />
      ))}
    </g>
  )
}

/**
 * A star as Van Gogh painted them: concentric daubed rings around a bright
 * core, not a dot. The dashes + round caps are what make the rings read as
 * separate brush marks.
 */
function PaintedStar({ x, y, scale }: PaintedStarSpec): React.JSX.Element {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {/* Soft aura, unfiltered — this is what makes it glow rather than sit flat. */}
      <circle r="26" fill="url(#sk-star-glow)" />
      <g filter="url(#sk-impasto-fine)">
        {/* Two rings of short curved dabs around a bright core — the painting's
            characteristic halo. Dash counts are chosen against each ring's
            circumference so you get ~6-8 separate marks, not 2 fat arcs. */}
        <circle
          r="17"
          fill="none"
          stroke="var(--color-star-600)"
          strokeWidth="4"
          strokeDasharray="9 8"
          strokeLinecap="round"
          opacity="0.5"
        />
        <circle
          r="9.5"
          fill="none"
          stroke="var(--color-star-400)"
          strokeWidth="3.6"
          strokeDasharray="8 6"
          strokeLinecap="round"
          opacity="0.85"
        />
        <circle r="3.4" fill="var(--color-moon-100)" />
      </g>
    </g>
  )
}

/**
 * The moon.
 *
 * Toned down from concentric dashed gold rings around a flat grey disc, which
 * at this size read as a logo or a target rather than a light source. The
 * halo now carries it, the rings are thinner and dimmer, and the core is warm
 * instead of neutral grey.
 */
function Moon(): React.JSX.Element {
  return (
    <g opacity="0.62">
      <circle cx={MOON.x} cy={MOON.y} r={MOON.r * 2.8} fill="url(#sk-moon-glow)" />
      <g filter="url(#sk-impasto-fine)">
        <circle
          cx={MOON.x}
          cy={MOON.y}
          r={MOON.r}
          fill="none"
          stroke="var(--color-star-400)"
          strokeWidth="6"
          strokeDasharray="46 26"
          strokeLinecap="round"
          opacity="0.42"
        />
        <circle
          cx={MOON.x}
          cy={MOON.y}
          r={MOON.r - 16}
          fill="none"
          stroke="var(--color-star-300)"
          strokeWidth="5"
          strokeDasharray="34 20"
          strokeLinecap="round"
          opacity="0.34"
        />
        <circle cx={MOON.x} cy={MOON.y} r={MOON.r - 30} fill="var(--color-star-300)" opacity="0.22" />
      </g>
    </g>
  )
}

function Stars({ stars }: { stars: PaintedStarSpec[] }): React.JSX.Element {
  return (
    <g filter="url(#sk-impasto)">
      {stars.map((star, i) => (
        <PaintedStar key={i} {...star} />
      ))}
    </g>
  )
}

function Grain(): React.JSX.Element {
  // No `mix-blend-mode` here on purpose. Overlay blending forced the whole
  // surface through a non-separable blend and defeated straightforward raster
  // caching; a flat low-opacity noise wash kills gradient banding just as well.
  return <rect width="1200" height="800" filter="url(#sk-canvas)" opacity="0.05" />
}

/* ---------------------------------------------------------------------------
 * Layers
 * ------------------------------------------------------------------------ */

/** The gradient wash. Carries most of the mood for essentially zero cost, and
 *  is the entire background at `plain` quality. */
function Wash(): React.JSX.Element {
  return (
    <>
      <div className="absolute inset-0 bg-night-950" />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            'radial-gradient(120% 90% at 82% 6%, rgb(52 76 165 / 0.85), transparent 62%)',
            'radial-gradient(85% 65% at 18% 42%, rgb(40 62 140 / 0.5), transparent 62%)',
            'radial-gradient(95% 70% at 10% 84%, rgb(34 68 50 / 0.6), transparent 62%)',
            'radial-gradient(75% 55% at 48% 108%, rgb(184 118 40 / 0.4), transparent 66%)'
          ].join(', ')
        }}
      />
    </>
  )
}

/**
 * One promoted compositor layer, showing a *baked* coat.
 *
 * `inset` is negative so the layer is larger than the window: translating it
 * then never exposes an empty edge. `cover` keeps the artwork filling the layer
 * at any aspect ratio.
 */
function Layer({
  animation,
  inset,
  delay,
  url
}: {
  animation: string
  /** e.g. '-8%'. Must be generous enough to cover the layer's own motion. */
  inset: string
  delay?: string
  url: string
}): React.JSX.Element {
  const animated = motion(animation)
  return (
    <div
      className={animated ? `absolute ${animated}` : 'absolute'}
      style={{
        inset,
        backgroundImage: `url("${url}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        willChange: animated ? 'transform, opacity' : undefined,
        animationDelay: animated ? delay : undefined
      }}
    />
  )
}

/** Every mark, in one unpromoted `<svg>`, with nothing animated. The filters run
 *  at first paint and never again — this is what `still` and `plain` cost. */
function StillPainting(): React.JSX.Element {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox={VIEW_BOX}
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
    >
      <Ribbons ribbons={DEEP_RIBBONS} coat="deep" />
      <Ribbons ribbons={MID_RIBBONS} coat="mid" />
      <Ribbons ribbons={TOP_RIBBONS} coat="top" />
      <Moon />
      {STAR_LAYERS.map((stars, i) => (
        <Stars key={i} stars={stars} />
      ))}
      <Grain />
    </svg>
  )
}

/**
 * The three moving coats, defined once so they can be baked.
 *
 * Three, not six. Each one becomes a full-window texture on the GPU, and on the
 * integrated graphics this app is aimed at that memory is the binding
 * constraint. The star field twinkles as a whole rather than in two phases,
 * which is a fair trade for one fewer window-sized layer.
 */
const MOVING_COATS = [
  {
    key: 'deep',
    animation: 'animate-drift-slow',
    inset: '-8%',
    marks: (
      <>
        <PaintDefs />
        <Ribbons ribbons={DEEP_RIBBONS} coat="deep" />
      </>
    )
  },
  {
    key: 'lit',
    animation: 'animate-drift',
    inset: '-8%',
    marks: (
      <>
        <PaintDefs />
        <Ribbons ribbons={MID_RIBBONS} coat="mid" />
        <Ribbons ribbons={TOP_RIBBONS} coat="top" />
        <Moon />
      </>
    )
  },
  {
    key: 'stars',
    animation: 'animate-twinkle',
    inset: '0%',
    marks: (
      <>
        <PaintDefs />
        {STAR_LAYERS.map((stars, i) => (
          <Stars key={i} stars={stars} />
        ))}
      </>
    )
  }
] as const

/**
 * Bakes the moving coats once and hands back their blob URLs.
 *
 * Runs in an effect rather than during render because it touches
 * `getComputedStyle` and `URL.createObjectURL`, and because the first paint
 * should be the still painting — not a blank sky while three SVGs serialize.
 */
function useBakedCoats(enabled: boolean): string[] | null {
  const [urls, setUrls] = useState<string[] | null>(null)

  useEffect(() => {
    if (!enabled) {
      setUrls(null)
      return
    }

    const baked = MOVING_COATS.map((coat) => bakeLayer(coat.marks, 1200, 800))
    setUrls(baked.map((layer) => layer.url))

    return () => {
      setUrls(null)
      baked.forEach((layer) => layer.revoke())
    }
  }, [enabled])

  return urls
}

/** The same marks as `StillPainting`, but each coat is a baked image in its own
 *  promoted layer, so moving them is compositor work rather than re-rasterizing
 *  SVG geometry every frame. */
function LivingPainting({ urls }: { urls: string[] }): React.JSX.Element {
  return (
    <>
      {MOVING_COATS.map((coat, i) => (
        <Layer
          key={coat.key}
          animation={coat.animation}
          inset={coat.inset}
          delay={coat.key === 'stars' ? '0s' : undefined}
          url={urls[i]}
        />
      ))}

      {/* Canvas grain — static, so it stays put while the paint moves under it. */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox={VIEW_BOX}
        preserveAspectRatio="xMidYMid slice"
        role="presentation"
      >
        <Grain />
      </svg>
    </>
  )
}

export interface StarryBackgroundProps {
  /** Defaults to the cheapest full rendering, so the first paint — before
   *  settings have loaded — is never the expensive one. */
  quality?: BackgroundQuality
}

function StarryBackgroundImpl({ quality = 'still' }: StarryBackgroundProps): React.JSX.Element {
  // Baking is asynchronous by one frame, so `painting` shows the still painting
  // until its textures exist. Same marks either way — nothing visibly changes
  // except that it starts moving.
  const bakedUrls = useBakedCoats(quality === 'painting')

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ contain: 'layout paint style' }}
    >
      <Wash />

      {quality !== 'plain' && (
        <>
          <PaintResources />
          {quality === 'painting' && bakedUrls ? <LivingPainting urls={bakedUrls} /> : <StillPainting />}
        </>
      )}

      {/*
        Readability veil, so text contrast never depends on where a swirl
        happened to land.

        It carries far more weight than it used to. Every piece of text in this
        app used to sit inside an opaque panel, so the backdrop could be as
        loud as it liked; now the type sits on the paint. Two passes: a flat
        wash that guarantees a contrast floor, and a soft horizontal darkening
        toward the centre where the reading column actually is, so the painting
        stays vivid at the edges of the window.
      */}
      <div className="absolute inset-0 bg-night-950/36" />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(130% 100% at 50% 42%, rgb(6 10 27 / 0.42), rgb(6 10 27 / 0.1) 58%, transparent 78%)'
        }}
      />
    </div>
  )
}

export const StarryBackground = memo(StarryBackgroundImpl)
