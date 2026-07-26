import type { ReactNode } from 'react'
import { cn } from './cn'

export type AlertTone = 'error' | 'warning' | 'success' | 'info'

/** A stroke of colour in the margin and the words themselves — not a tinted,
 *  bordered, rounded box. The old boxes were the same shape as every other
 *  panel, so a message never stood out from ordinary content anyway. */
const ALERT_TONES: Record<AlertTone, { bar: string; text: string }> = {
  error: { bar: 'bg-vermilion-500', text: 'text-vermilion-400' },
  warning: { bar: 'bg-ochre-400', text: 'text-ochre-300' },
  success: { bar: 'bg-cypress-400', text: 'text-cypress-400' },
  info: { bar: 'bg-cobalt-400', text: 'text-cobalt-200' }
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
  const { bar, text } = ALERT_TONES[tone]
  return (
    <p className={cn('relative py-1 pl-4 text-sm leading-relaxed', text, className)}>
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-[3px] rounded-pill', bar)} />
      {children}
    </p>
  )
}

/** An aside in the margin voice: smaller, quieter, set off by a rule rather
 *  than enclosed. */
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
    <div className={cn('hairline-top flex gap-3 pt-3 text-xs leading-relaxed text-moon-400', className)}>
      {icon && <span className="mt-0.5 shrink-0 text-star-600">{icon}</span>}
      <span className="min-w-0 max-w-[68ch]">{children}</span>
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
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icon && <span className="mb-4 text-star-600/60">{icon}</span>}
      <p className="font-display text-lg font-medium text-moon-200 italic">{title}</p>
      {description && <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-moon-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
