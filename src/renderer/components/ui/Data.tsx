import type { ReactNode } from 'react'
import { cn } from './cn'

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'gold'

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-moon-200',
  good: 'text-cypress-400',
  warn: 'text-ochre-300',
  bad: 'text-vermilion-400',
  gold: 'text-star-300'
}

const TONE_FILL: Record<Tone, string> = {
  neutral: 'bg-cobalt-600',
  good: 'bg-cypress-500',
  warn: 'bg-ochre-400',
  bad: 'bg-vermilion-500',
  gold: 'bg-star-400'
}

/**
 * A short qualifier attached to something else: a track's note count, a key's
 * fit percentage, the playback state.
 *
 * This replaced `Badge`. A bordered, tinted, rounded-full pill turns every
 * incidental fact into a UI object competing for attention, and a screen with
 * nine of them is the most reliable sign of a generated interface. Small caps
 * in the display face reads as an annotation in the margin, which is what these
 * actually are — so colour is reserved for the ones that mean something.
 */
export function Annotation({
  tone = 'neutral',
  children,
  className
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <span className={cn('smallcaps text-[0.8rem] whitespace-nowrap', TONE_TEXT[tone], className)}>
      {children}
    </span>
  )
}

/**
 * One number from a report, set as a figure: the value at editorial scale in
 * the display face, its caption small underneath.
 *
 * This replaced `StatTile`. Eleven bordered tiles in a three-column grid — the
 * Arranger's old report — is a bento by any other name; unboxed figures let a
 * report be read as a paragraph of numbers rather than scanned as a dashboard.
 */
export function Figure({
  label,
  value,
  sub,
  tone = 'neutral',
  className
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  tone?: Tone
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('min-w-0', className)}>
      <div className={cn('font-display text-[1.75rem] leading-none font-semibold', TONE_TEXT[tone])}>
        {value}
      </div>
      <div className="mt-1.5 text-[0.8rem] leading-snug text-moon-400">{label}</div>
      {sub && <div className="mt-0.5 text-[0.7rem] leading-snug text-moon-500">{sub}</div>}
    </div>
  )
}

/**
 * The conversion report's proportions as one flat painted band, with the
 * breakdown set as type beneath it.
 *
 * Was `SegmentedProgress`: a rounded-full bar with a row of coloured legend
 * dots. The dots duplicated information the labels already carried, and the pill
 * rounding fought every other edge on the page.
 */
export function PaintedBar({
  segments,
  className
}: {
  segments: { value: number; tone: Tone; label: string }[]
  className?: string
}): React.JSX.Element {
  const total = segments.reduce((sum, s) => sum + s.value, 0)

  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex h-2 w-full overflow-hidden bg-night-950/70">
        {segments.map((segment) => (
          <div
            key={segment.label}
            title={`${segment.label}: ${segment.value}`}
            className={cn('h-full', TONE_FILL[segment.tone])}
            style={{ width: total > 0 ? `${(segment.value / total) * 100}%` : '0%' }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {segments.map((segment) => (
          <Annotation key={segment.label} tone={segment.tone}>
            {segment.label}
          </Annotation>
        ))}
      </div>
    </div>
  )
}

/**
 * A note-grid / keybind cell.
 *
 * The `aria-label`, and the bound value living in the button's *text content*,
 * are asserted by `Settings/index.test.tsx` — do not move either into a title
 * or pseudo-element.
 */
export function KeyCap({
  id,
  value,
  listening,
  onClick,
  ariaLabel,
  className
}: {
  id: string
  value: string
  listening: boolean
  onClick: () => void
  ariaLabel: string
  className?: string
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'flex h-14 w-14 flex-col items-center justify-center rounded-tile text-xs transition-colors',
        listening
          ? 'animate-pulse bg-star-400 text-night-950'
          : 'bg-night-900/80 text-moon-300 shadow-cell ring-1 ring-cobalt-700/35 hover:bg-night-800/85 hover:text-moon-100',
        className
      )}
    >
      <span className="text-[0.65rem] opacity-50">{id}</span>
      <span className="font-display text-sm font-semibold">{listening ? '…' : value}</span>
    </button>
  )
}
