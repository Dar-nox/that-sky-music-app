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
    <details open={defaultOpen} className={cn('group rounded-tile border border-cobalt-700/25 bg-night-950/40', className)}>
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-bold tracking-[0.1em] text-star-500 uppercase select-none marker:content-none hover:text-star-400">
        <span className="mr-1.5 inline-block transition-transform group-open:rotate-90">›</span>
        {summary}
      </summary>
      <div className="space-y-3 border-t border-cobalt-700/20 px-3 py-3">{children}</div>
    </details>
  )
}
