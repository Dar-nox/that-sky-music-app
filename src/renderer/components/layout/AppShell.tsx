import type { ReactNode } from 'react'
import { StarryBackground } from '../background/StarryBackground'
import { useNavStore, type AppPage } from '../../store/navStore'
import { useAppearanceStore } from '../../store/appearanceStore'
import { UiPaintResources, cn } from '../ui'
import { IconStar } from '../icons'

export type IpcStatus = 'checking' | 'connected' | 'failed'

const NAV_ITEMS: { id: AppPage; label: string }[] = [
  { id: 'convert', label: 'Convert' },
  { id: 'arranger', label: 'Arranger' },
  { id: 'play', label: 'Play' },
  { id: 'settings', label: 'Settings' }
]

const STATUS_DOT: Record<IpcStatus, string> = {
  connected: 'bg-cypress-400',
  failed: 'bg-vermilion-500',
  checking: 'bg-moon-500'
}

const STATUS_TEXT: Record<IpcStatus, string> = {
  connected: 'text-cypress-400',
  failed: 'text-vermilion-400',
  checking: 'text-moon-500'
}

/**
 * The masthead.
 *
 * This replaced a 60px icon rail with a status dot at the bottom, which is
 * about as legible a "generated admin panel" signature as exists. A masthead
 * also gives the editorial column back the horizontal room it wants, and lets
 * Play Music Mode's library read as this page's index rather than as a second
 * sidebar competing with a first.
 *
 * Nothing here uses `backdrop-filter`. Over an animated backdrop each blurred
 * surface is a full re-blur of its region every frame, and the three the app
 * used to have were among the most expensive things on screen.
 */
function Masthead({ ipcStatus }: { ipcStatus: IpcStatus }): React.JSX.Element {
  const page = useNavStore((s) => s.page)
  const setPage = useNavStore((s) => s.setPage)

  return (
    <header className="relative z-20 shrink-0 bg-night-950/88">
      <div className="flex items-center gap-8 px-7 py-4">
        <div className="flex shrink-0 items-baseline gap-2.5">
          <span className="translate-y-0.5 text-star-400">
            <IconStar size={19} />
          </span>
          <span className="font-display text-xl font-semibold text-moon-50">SkyKeys</span>
          {/* Holds open the gap the "MIDI to Sky sheets" tagline used to fill, so
              the wordmark still reads as separate from the nav rather than
              running straight into it. */}
          <span aria-hidden="true" className="block w-12 lg:w-24" />
        </div>

        <nav aria-label="Primary" className="flex items-baseline gap-7">
          {NAV_ITEMS.map(({ id, label }) => {
            const active = page === id
            return (
              <button
                key={id}
                onClick={() => setPage(id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'font-display text-[0.95rem] font-medium transition-colors',
                  active ? 'brush-underline text-star-200' : 'text-moon-400 hover:text-moon-100'
                )}
              >
                {label}
              </button>
            )
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 text-[0.75rem]">
          <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-pill', STATUS_DOT[ipcStatus])} />
          <span className="text-moon-500">IPC</span>
          {/*
            Rendered raw and alone in its own element. `App.test.tsx` does
            `getByText('connected')`, so this must never be re-worded, merged
            into a sentence, or replaced by an icon.
          */}
          <span className={cn('smallcaps', STATUS_TEXT[ipcStatus])}>{ipcStatus}</span>
        </div>
      </div>
      {/* A painted edge rather than a border, and no blur behind it. */}
      <div className="h-px w-full bg-linear-to-r from-transparent via-cobalt-600/45 to-transparent" />
    </header>
  )
}

export function AppShell({ ipcStatus, children }: { ipcStatus: IpcStatus; children: ReactNode }): React.JSX.Element {
  const backgroundQuality = useAppearanceStore((s) => s.backgroundQuality)

  return (
    <div className="relative isolate flex h-screen flex-col overflow-hidden text-moon-100">
      <StarryBackground quality={backgroundQuality} />
      <UiPaintResources />
      <Masthead ipcStatus={ipcStatus} />
      <main className="scrollbar-night relative z-10 min-h-0 min-w-0 flex-1 overflow-auto">{children}</main>
    </div>
  )
}
