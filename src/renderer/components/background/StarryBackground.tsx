import { memo } from 'react'
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
 * Four stacked layers, cheapest first:
 *   1. gradient wash          — carries most of the mood for zero cost
 *   2. brush-stroke swirls    — the impasto SVG
 *   3. star halos + moon
 *   4. canvas grain + a flat readability veil
 *
 * Performance rules this file must keep to:
 *   - Nothing inside a filtered `<g>` is ever animated. Filter output is only
 *     cached while its contents are unchanged, so the animation class always
 *     goes on an *ancestor* of the filtered group, letting the compositor
 *     transform a cached texture instead of re-running the filter each frame.
 *   - Only `transform` and `opacity` are animated — never layout properties.
 *   - The component takes no props and holds no state, and is wrapped in
 *     `memo`, so React never re-renders it. That matters because playback fires
 *     note events ~20x/second while this is on screen.
 */

/** Read once at module scope — used to drop `will-change` hints too, which the
 *  CSS-only reduced-motion rule in globals.css can't do. */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Escape hatch: if the rotating layer ever proves expensive on a slower GPU,
 *  flip this to false. Everything else is translate/opacity only. */
const ENABLE_SWIRL_ROTATION = true

function motion(className: string): string | undefined {
  return PREFERS_REDUCED_MOTION ? undefined : className
}

function RibbonPass({ ribbon }: { ribbon: Ribbon }): React.JSX.Element {
  return (
    <use
      href={`#sk-swirl-${ribbon.swirl}`}
      transform={`translate(0 ${ribbon.dy})`}
      stroke={ribbon.color}
      strokeWidth={ribbon.width}
      strokeDasharray={ribbon.dash}
      strokeDashoffset={ribbon.offset}
      strokeLinecap="round"
      opacity={ribbon.opacity}
    />
  )
}

function Ribbons({ ribbons }: { ribbons: Ribbon[] }): React.JSX.Element {
  return (
    <g fill="none" filter="url(#sk-impasto)">
      {ribbons.map((ribbon, i) => (
        <RibbonPass key={i} ribbon={ribbon} />
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

function StarryBackgroundImpl(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ contain: 'paint' }}
    >
      {/* 1. Base wash. Three radial glows do most of the atmospheric work. */}
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

      {/* 2 + 3. The painting itself. */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        role="presentation"
      >
        <defs>
          {/*
            The brush filter.

            The trick is LOW-frequency, HIGH-amplitude displacement: a slow,
            lazy warp bends each stroke along its length the way a loaded brush
            wanders, then a generous blur softens the edge into wet paint.

            High-frequency noise (or a specular "canvas tooth" pass) is what
            makes this read as gravel/lichen instead of oil — so there is
            deliberately none of it here. What sells the brush is the geometry:
            many parallel passes, round caps, and long dashes that break each
            pass into comma-shaped daubs.

            colorInterpolationFilters="sRGB" is deliberate — the linearRGB
            default is slower and desaturates the golds.
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

          {/* Linen-canvas tooth — very faint, purely to kill banding. */}
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

          {/* The four brush gestures, defined once and re-stroked per ribbon. */}
          <path id="sk-swirl-a" d={SWIRL_PATHS.a} />
          <path id="sk-swirl-b" d={SWIRL_PATHS.b} />
          <path id="sk-swirl-c" d={SWIRL_PATHS.c} />
          <path id="sk-swirl-d" d={SWIRL_PATHS.d} />
        </defs>

        {/* Base coat — drifts. Animation is on the unfiltered ancestor. */}
        <g className={motion('animate-drift-slow will-change-transform')}>
          <Ribbons ribbons={DEEP_RIBBONS} />
        </g>

        {/* Lit swirls — the single rotating layer, 240s per turn. */}
        <g
          className={motion(
            ENABLE_SWIRL_ROTATION ? 'animate-swirl will-change-transform' : 'animate-drift will-change-transform'
          )}
          style={{ transformOrigin: '600px 400px', transformBox: 'view-box' }}
        >
          <Ribbons ribbons={MID_RIBBONS} />
        </g>

        {/* Gold flicks and the horizon band — drifts the other way. */}
        <g className={motion('animate-drift will-change-transform')}>
          <Ribbons ribbons={TOP_RIBBONS} />
        </g>

        {/* The moon. */}
        <g>
          <circle cx={MOON.x} cy={MOON.y} r={MOON.r * 2.8} fill="url(#sk-moon-glow)" />
          <g filter="url(#sk-impasto-fine)">
            <circle
              cx={MOON.x}
              cy={MOON.y}
              r={MOON.r}
              fill="none"
              stroke="var(--color-star-400)"
              strokeWidth="9"
              strokeDasharray="46 26"
              strokeLinecap="round"
              opacity="0.65"
            />
            <circle
              cx={MOON.x}
              cy={MOON.y}
              r={MOON.r - 16}
              fill="none"
              stroke="var(--color-star-300)"
              strokeWidth="7"
              strokeDasharray="34 20"
              strokeLinecap="round"
              opacity="0.5"
            />
            <circle cx={MOON.x} cy={MOON.y} r={MOON.r - 30} fill="var(--color-moon-100)" opacity="0.3" />
          </g>
        </g>

        {/* Star halos — three groups twinkling out of phase. */}
        {STAR_GROUPS.map((group, i) => (
          <g
            key={i}
            className={motion('animate-twinkle will-change-[opacity]')}
            style={PREFERS_REDUCED_MOTION ? undefined : { animationDelay: `${i * 1.7}s` }}
          >
            <g filter="url(#sk-impasto)">
              {group.map((star, j) => (
                <PaintedStar key={j} {...star} />
              ))}
            </g>
          </g>
        ))}

        {/* 4a. Canvas grain — barely there, just enough to kill gradient banding. */}
        <rect
          width="1200"
          height="800"
          filter="url(#sk-canvas)"
          opacity="0.045"
          style={{ mixBlendMode: 'overlay' }}
        />
      </svg>

      {/* 4b. Readability veil, so text contrast never depends on where a swirl
          happened to land — but light enough that the painting still reads. */}
      <div className="absolute inset-0 bg-night-950/25" />
    </div>
  )
}

export const StarryBackground = memo(StarryBackgroundImpl)
