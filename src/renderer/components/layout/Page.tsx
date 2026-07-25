import type { ReactNode } from 'react'
import { cn } from '../ui/cn'
import { SectionHeading } from '../ui/Card'

/**
 * Sticky page title bar. Together with the sidebar these are the only two
 * `backdrop-filter` surfaces in the app — blurring over the animated filtered
 * SVG is the one thing that would cost real frame rate, so it is deliberately
 * capped at two.
 */
export function PageHeader({
  title,
  description,
  actions
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}): React.JSX.Element {
  return (
    <div className="sticky top-0 z-20 border-b border-cobalt-700/25 bg-night-950/60 px-6 py-4 backdrop-blur-md">
      <div className="mx-auto w-full max-w-4xl">
        <SectionHeading level={1} title={title} description={description} actions={actions} />
      </div>
    </div>
  )
}

export function PageContainer({
  children,
  className
}: {
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return <div className={cn('mx-auto w-full max-w-4xl space-y-5 px-6 pt-5 pb-16', className)}>{children}</div>
}
