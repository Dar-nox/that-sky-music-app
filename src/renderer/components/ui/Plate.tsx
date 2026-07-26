import type { ReactNode } from 'react'
import { cn } from './cn'
import { PaintFrame } from './paint'

const PADDING = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-7'
} as const

export interface PlateProps {
  padding?: keyof typeof PADDING
  className?: string
  children: ReactNode
}

/**
 * The one enclosing surface in this interface.
 *
 * Use it where a region genuinely has to separate itself from the painting to
 * stay legible — the live note grid, the note log, the library index, the
 * keycap board. It is *not* the default wrapper for a group of related
 * controls; everything else sits directly on the canvas and is separated by
 * space and `PaintRule`. If a page has more than two of these, the page is
 * still a bento grid wearing a different texture.
 *
 * The edge is a hand-blocked `PaintFrame`, not a border-radius.
 */
export function Plate({ padding = 'md', className, children }: PlateProps): React.JSX.Element {
  return (
    <div className={cn('paint-plate relative', PADDING[padding], className)}>
      <PaintFrame />
      <div className="relative">{children}</div>
    </div>
  )
}
