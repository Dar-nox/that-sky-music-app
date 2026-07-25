import { useEffect, useState } from 'react'
import { AppShell } from './components/layout/AppShell'
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
    <AppShell ipcStatus={ipcStatus}>
      <Page />
    </AppShell>
  )
}

export default App
