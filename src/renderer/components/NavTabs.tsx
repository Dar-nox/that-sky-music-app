import { useNavStore, type AppPage } from '../store/navStore'

const TABS: { id: AppPage; label: string }[] = [
  { id: 'convert', label: 'Convert' },
  { id: 'arranger', label: 'Arranger' },
  { id: 'play', label: 'Play Music' },
  { id: 'settings', label: 'Settings' }
]

export function NavTabs() {
  const page = useNavStore((s) => s.page)
  const setPage = useNavStore((s) => s.setPage)

  return (
    <nav className="flex gap-1 border-b border-slate-700 px-4">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setPage(tab.id)}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            page === tab.id
              ? 'border-b-2 border-sky-400 text-sky-300'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
