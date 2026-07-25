import { useNavStore, type AppPage } from '../../store/navStore'
import { cn } from '../ui/cn'
import { IconArranger, IconConvert, IconMusic, IconSettings, IconStar, type IconProps } from '../icons'

export type IpcStatus = 'checking' | 'connected' | 'failed'

const NAV_ITEMS: { id: AppPage; label: string; Icon: (props: IconProps) => React.JSX.Element }[] = [
  { id: 'convert', label: 'Convert', Icon: IconConvert },
  { id: 'arranger', label: 'Arranger', Icon: IconArranger },
  { id: 'play', label: 'Play Music', Icon: IconMusic },
  { id: 'settings', label: 'Settings', Icon: IconSettings }
]

const STATUS_DOT: Record<IpcStatus, string> = {
  connected: 'bg-cypress-400 shadow-[0_0_8px_1px_rgb(127_176_105/.7)]',
  failed: 'bg-vermilion-500',
  checking: 'bg-moon-500'
}

const STATUS_TEXT: Record<IpcStatus, string> = {
  connected: 'text-cypress-400',
  failed: 'text-vermilion-400',
  checking: 'text-moon-500'
}

export function Sidebar({ ipcStatus }: { ipcStatus: IpcStatus }): React.JSX.Element {
  const page = useNavStore((s) => s.page)
  const setPage = useNavStore((s) => s.setPage)

  return (
    <aside className="paint-panel relative z-10 flex w-16 shrink-0 flex-col rounded-none border-y-0 border-l-0 backdrop-blur-md lg:w-60">
      <div className="flex items-center gap-2.5 px-3 py-4 lg:px-4">
        <span className="shrink-0 text-star-400">
          <IconStar size={24} />
        </span>
        <span className="hidden min-w-0 lg:block">
          <span className="block font-display text-lg leading-tight font-semibold text-moon-50">SkyKeys</span>
          <span className="block truncate text-[11px] text-moon-400">MIDI to Sky sheets</span>
        </span>
      </div>

      <nav aria-label="Primary" className="flex flex-col gap-1 px-2 py-2">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = page === id
          return (
            <button
              key={id}
              onClick={() => setPage(id)}
              title={label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-tile px-3 py-2.5 text-sm font-semibold transition-colors',
                'justify-center lg:justify-start',
                active
                  ? 'brush-edge bg-cobalt-800/50 text-star-200'
                  : 'text-moon-300 hover:bg-night-800/60 hover:text-moon-100'
              )}
            >
              <Icon size={19} className="shrink-0" />
              <span className="sr-only lg:not-sr-only">{label}</span>
            </button>
          )
        })}
      </nav>

      <div className="mt-auto border-t border-cobalt-700/25 px-3 py-3 lg:px-4">
        <div className="flex items-center justify-center gap-2 text-[11px] lg:justify-start">
          <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-pill', STATUS_DOT[ipcStatus])} />
          <span className="sr-only text-moon-500 lg:not-sr-only">IPC</span>
          {/*
            Rendered raw and alone in its own element. `App.test.tsx` does
            `getByText('connected')`, so this must never be re-worded, merged
            into a sentence, or replaced by an icon. `sr-only` is CSS-only, so
            the text node stays intact in jsdom.
          */}
          <span className={cn('sr-only font-semibold lg:not-sr-only', STATUS_TEXT[ipcStatus])}>{ipcStatus}</span>
        </div>
      </div>
    </aside>
  )
}
