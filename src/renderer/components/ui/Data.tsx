import type { ReactNode } from 'react'
import { cn } from './cn'

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'gold'

const BADGE_TONES: Record<Tone, string> = {
  neutral: 'border-cobalt-700/40 bg-night-900/70 text-moon-300',
  good: 'border-cypress-500/45 bg-cypress-800/60 text-cypress-400',
  warn: 'border-ochre-500/45 bg-ochre-600/20 text-ochre-300',
  bad: 'border-vermilion-600/45 bg-vermilion-700/25 text-vermilion-400',
  gold: 'border-star-500/50 bg-star-700/25 text-star-300'
}

export function Badge({
  tone = 'neutral',
  children,
  className
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        BADGE_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

const STAT_TONES: Record<Tone, string> = {
  neutral: 'text-moon-100',
  good: 'text-cypress-400',
  warn: 'text-ochre-300',
  bad: 'text-vermilion-400',
  gold: 'text-star-300'
}

export function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
  className
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: Tone
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('paint-inset rounded-tile px-3 py-2.5', className)}>
      <div className="text-[10px] font-bold tracking-[0.1em] text-moon-500 uppercase">{label}</div>
      <div className={cn('font-display text-xl leading-tight font-semibold', STAT_TONES[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-moon-400">{sub}</div>}
    </div>
  )
}

/**
 * The stacked "brush bar" used by both conversion reports — one horizontal band
 * split proportionally, so the shape of a conversion is readable at a glance.
 */
export function SegmentedProgress({
  segments,
  className
}: {
  segments: { value: number; tone: Tone; label: string }[]
  className?: string
}): React.JSX.Element {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const fills: Record<Tone, string> = {
    neutral: 'bg-cobalt-600',
    good: 'bg-cypress-500',
    warn: 'bg-ochre-400',
    bad: 'bg-vermilion-500',
    gold: 'bg-star-400'
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-pill bg-night-950/80">
        {segments.map((segment) => (
          <div
            key={segment.label}
            title={`${segment.label}: ${segment.value}`}
            className={cn('h-full first:rounded-l-pill last:rounded-r-pill', fills[segment.tone])}
            style={{ width: total > 0 ? `${(segment.value / total) * 100}%` : '0%' }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((segment) => (
          <span key={segment.label} className="flex items-center gap-1.5 text-[11px] text-moon-400">
            <span className={cn('h-2 w-2 rounded-pill', fills[segment.tone])} />
            {segment.label}
          </span>
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
        'flex h-14 w-14 flex-col items-center justify-center rounded-tile text-xs font-semibold transition-colors',
        listening
          ? 'animate-pulse bg-star-500 text-night-950 ring-2 ring-star-200'
          : 'bg-night-800/85 text-moon-200 shadow-cell ring-1 ring-cobalt-700/40 hover:bg-night-700/85 hover:ring-cobalt-500/50',
        className
      )}
    >
      <span className="opacity-55">{id}</span>
      <span className="font-display text-sm font-semibold">{listening ? '…' : value}</span>
    </button>
  )
}
