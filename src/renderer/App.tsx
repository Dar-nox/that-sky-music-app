import { useEffect, useState } from 'react'
import { NavTabs } from './components/NavTabs'
import { ConvertMode } from './pages/ConvertMode'
import { ArrangerMode } from './pages/ArrangerMode'
import { PlayMusicMode } from './pages/PlayMusicMode'
import { Settings } from './pages/Settings'
import { useNavStore } from './store/navStore'

const PAGES = {
  convert: ConvertMode,
  arranger: ArrangerMode,
  play: PlayMusicMode,
  settings: Settings
}

function App() {
  const page = useNavStore((s) => s.page)
  const [ipcStatus, setIpcStatus] = useState<'checking' | 'connected' | 'failed'>('checking')

  useEffect(() => {
    window.skyAPI
      .ping()
      .then((reply) => setIpcStatus(reply === 'pong' ? 'connected' : 'failed'))
      .catch(() => setIpcStatus('failed'))
  }, [])

  const Page = PAGES[page]

  return (
    <div className="flex h-screen flex-col bg-slate-900 text-slate-100">
      <NavTabs />
      <main className="flex-1 overflow-auto">
        <Page />
      </main>
      <footer className="border-t border-slate-800 px-4 py-1 text-xs text-slate-500">
        IPC:{' '}
        <span
          className={
            ipcStatus === 'connected'
              ? 'text-emerald-400'
              : ipcStatus === 'failed'
                ? 'text-red-400'
                : 'text-slate-500'
          }
        >
          {ipcStatus}
        </span>
      </footer>
    </div>
  )
}

export default App
