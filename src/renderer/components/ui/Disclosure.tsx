import type { ReactNode } from 'react'
import { cn } from './cn'

/**
 * Native `<details>`, so children stay mounted when collapsed — no state is
 * lost, and no conditional-render guard in the caller has to change.
 */
export function Disclosure({
  summary,
  defaultOpen = false,
  children,
  className
}: {
  summary: string
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <details open={defaultOpen} className={cn('group hairline-top pt-3', className)}>
      <summary className="cursor-pointer list-none font-display text-sm font-medium text-star-500 italic select-none marker:content-none hover:text-star-300">
        <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
        {summary}
      </summary>
      <div className="mt-4 space-y-4 pl-4">{children}</div>
    </details>
  )
}
