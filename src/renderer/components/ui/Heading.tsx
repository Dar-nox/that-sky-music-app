import type { ReactNode } from 'react'
import { cn } from './cn'

export interface SectionHeadingProps {
  title: string
  level?: 1 | 2 | 3
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

const SIZES = {
  1: 'text-[2.6rem] leading-[1.05] font-semibold',
  2: 'text-2xl leading-tight font-medium italic',
  3: 'text-lg leading-tight font-medium italic'
} as const

/**
 * Renders `title` as the *only* child of the heading element.
 *
 * This is load-bearing: `App.test.tsx` asserts
 * `getByRole('heading', { name: 'Convert Mode' })`. Putting a numeral, icon or
 * annotation inside the heading would change its accessible name to something
 * like "I Convert Mode" and break that. Decorations go in `actions`, or in the
 * gutter `Movement` renders as a sibling.
 *
 * There is no `eyebrow` here any more. The 11px bold uppercase letterspaced
 * gold label that used to sit above every title in this app is the single most
 * recognisable generated-dashboard tell; hierarchy now comes from the size and
 * voice of the title itself, and from the space around it.
 */
export function SectionHeading({
  title,
  level = 2,
  description,
  actions,
  className
}: SectionHeadingProps): React.JSX.Element {
  const Tag = (['h1', 'h2', 'h3'] as const)[level - 1]

  return (
    <div className={cn('flex items-start justify-between gap-6', className)}>
      <div className="min-w-0">
        <Tag className={cn(SIZES[level], 'text-moon-50')}>{title}</Tag>
        {description && (
          <div className="mt-2.5 max-w-[62ch] text-sm leading-relaxed text-moon-300">{description}</div>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3 pt-1">{actions}</div>}
    </div>
  )
}
