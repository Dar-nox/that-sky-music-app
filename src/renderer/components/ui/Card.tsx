import type { ReactNode } from 'react'
import { cn } from './cn'

export type CardTone = 'panel' | 'inset' | 'ghost'

const TONES: Record<CardTone, string> = {
  panel: 'paint-panel',
  inset: 'paint-inset',
  ghost: 'border border-cobalt-700/20 bg-night-900/35'
}

const PADDING = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6'
} as const

export interface CardProps {
  tone?: CardTone
  padding?: keyof typeof PADDING
  className?: string
  children: ReactNode
}

export function Card({ tone = 'panel', padding = 'md', className, children }: CardProps): React.JSX.Element {
  return <div className={cn('rounded-card', TONES[tone], PADDING[padding], className)}>{children}</div>
}

export interface SectionHeadingProps {
  title: string
  level?: 1 | 2 | 3
  eyebrow?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

/**
 * Renders `title` as the *only* child of the heading element.
 *
 * This is load-bearing: `App.test.tsx` asserts
 * `getByRole('heading', { name: 'Convert Mode' })`. Putting a step number, icon
 * or badge inside the heading would change its accessible name to something
 * like "1 Convert Mode" and break that. Decorations go in `eyebrow`/`actions`,
 * which render as siblings.
 */
export function SectionHeading({
  title,
  level = 2,
  eyebrow,
  description,
  actions,
  className
}: SectionHeadingProps): React.JSX.Element {
  const Tag = (['h1', 'h2', 'h3'] as const)[level - 1]
  const sizes = {
    1: 'text-2xl',
    2: 'text-lg',
    3: 'text-sm'
  } as const

  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1 text-[11px] font-bold tracking-[0.14em] text-star-500 uppercase">{eyebrow}</div>
        )}
        <Tag className={cn(sizes[level], 'font-semibold text-moon-50')}>{title}</Tag>
        {description && <div className="mt-1.5 text-sm leading-relaxed text-moon-300">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export type AlertTone = 'error' | 'warning' | 'success' | 'info'

const ALERT_TONES: Record<AlertTone, string> = {
  error: 'border-vermilion-600/45 bg-vermilion-700/20 text-vermilion-400',
  warning: 'border-ochre-500/45 bg-ochre-600/15 text-ochre-300',
  success: 'border-cypress-500/45 bg-cypress-700/25 text-cypress-400',
  info: 'border-cobalt-500/40 bg-cobalt-800/30 text-cobalt-200'
}

/**
 * `children` must be a single text node when a test matches on it — see
 * Settings' "already bound to cell …" warning.
 */
export function Alert({
  tone,
  children,
  className
}: {
  tone: AlertTone
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <p className={cn('rounded-tile border px-3 py-2 text-sm', ALERT_TONES[tone], className)}>{children}</p>
  )
}

export function Callout({
  icon,
  children,
  className
}: {
  icon?: ReactNode
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-tile border border-cobalt-700/25 bg-night-900/50 px-3 py-2.5 text-xs leading-relaxed text-moon-400',
        className
      )}
    >
      {icon && <span className="mt-0.5 shrink-0 text-star-500">{icon}</span>}
      <span className="min-w-0">{children}</span>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      {icon && <span className="mb-3 text-star-600/70">{icon}</span>}
      <p className="font-display text-base font-semibold text-moon-200">{title}</p>
      {description && <p className="mt-1.5 max-w-xs text-sm text-moon-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
