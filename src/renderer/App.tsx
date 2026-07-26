import { useEffect, useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { ConvertMode } from './pages/ConvertMode'
import { ArrangerMode } from './pages/ArrangerMode'
import { PlayMusicMode } from './pages/PlayMusicMode'
import { Settings } from './pages/Settings'
import { useNavStore } from './store/navStore'
import { useAppearanceStore } from './store/appearanceStore'

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

  useEffect(() => {
    // Only the backdrop's quality is hoisted here. Everything else in settings
    // is read by the page that needs it; this one has to reach the shell.
    window.skyAPI
      .getSettings()
      .then((settings) => {
        if (settings.backgroundQuality) {
          useAppearanceStore.getState().setBackgroundQuality(settings.backgroundQuality)
        }
      })
      .catch(() => {
        // Stay on the cheap default — the backdrop is decoration, not function.
      })
  }, [])

  const Page = PAGES[page]

  return (
    <AppShell ipcStatus={ipcStatus}>
      <Page />
    </AppShell>
  )
}

export default App
