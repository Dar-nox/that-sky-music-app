import type { ReactNode } from 'react'
import { cn } from './cn'
import { PaintRule } from './paint'
import { SectionHeading } from './Heading'

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'] as const

export interface MovementProps {
  title: string
  /** 1-8. Renders as a roman numeral in the gutter. Omit for unordered
   *  sections — Settings' panels are peers, not steps. */
  index?: number
  description?: ReactNode
  actions?: ReactNode
  /** Suppress the closing brush rule on the last section of a page. */
  rule?: boolean
  className?: string
  children: ReactNode
}

/**
 * A section of a page.
 *
 * This is what replaced the `<Card>` stack. The numeral sits in a gutter beside
 * the title the way a plate number sits beside a caption in an art book, and
 * the content runs flush on the canvas underneath it — no panel, no border, no
 * gradient. What separates one section from the next is space and a brush rule.
 *
 * Sections are wide but the prose inside them is not: `SectionHeading` caps its
 * description at a real measure, because unboxed text has nothing else to stop
 * it running to 200 characters a line.
 */
export function Movement({
  title,
  index,
  description,
  actions,
  rule = true,
  className,
  children
}: MovementProps): React.JSX.Element {
  return (
    <section className={cn('mt-11 first:mt-0', className)}>
      <div className="grid grid-cols-[1fr] gap-x-6 sm:grid-cols-[2.75rem_minmax(0,1fr)]">
        <div
          aria-hidden="true"
          className="hidden pt-3 text-right font-display text-sm font-semibold tracking-[0.2em] text-star-600/60 sm:block"
        >
          {index ? ROMAN[index] : ''}
        </div>
        <div className="min-w-0">
          <SectionHeading level={2} title={title} description={description} actions={actions} />
          <div className="mt-6">{children}</div>
        </div>
      </div>
      {rule && <PaintRule className="mt-11" />}
    </section>
  )
}
