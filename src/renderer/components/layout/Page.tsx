import type { ReactNode } from 'react'
import { cn } from '../ui/cn'
import { SectionHeading } from '../ui/Heading'
import { PaintRule } from '../ui/paint'

/**
 * The page title, set as a plate title: large, in the display face, with room
 * around it and a brush rule underneath.
 *
 * It does not stick to the top of the scroll container any more. A sticky bar
 * over a painted backdrop needed a blurred or opaque background to stay legible
 * — the blur was one of the app's three per-frame `backdrop-filter` surfaces,
 * and an opaque bar would slice the painting in half. Letting the title scroll
 * away costs nothing: the masthead above it is what you navigate with.
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
    <div className="mx-auto w-full max-w-5xl px-7 pt-11 pb-1">
      <SectionHeading level={1} title={title} description={description} actions={actions} />
      <PaintRule className="mt-8" />
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
  return <div className={cn('mx-auto w-full max-w-5xl px-7 pt-10 pb-24', className)}>{children}</div>
}
