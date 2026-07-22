import { useEffect, useState } from 'react'
import type { GridCol, GridRow } from '@shared/song'
import { DEFAULT_NOTE_KEYS, DEFAULT_TRANSPORT_HOTKEYS, type NoteKeyId, type TransportAction } from '@shared/keybinds'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/settings'
import { captureKeyName } from './keyCapture'

const GRID_ROWS: GridRow[] = ['A', 'B', 'C']
const GRID_COLS: GridCol[] = [1, 2, 3, 4, 5]

const TRANSPORT_ACTIONS: { id: TransportAction; label: string }[] = [
  { id: 'playPause', label: 'Play / Pause' },
  { id: 'next', label: 'Next song' },
  { id: 'previous', label: 'Previous song' },
  { id: 'panic', label: 'Panic stop' }
]

type Listening = { kind: 'note'; id: NoteKeyId } | { kind: 'hotkey'; action: TransportAction } | null

export function Settings() {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [listening, setListening] = useState<Listening>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.skyAPI
      .getSettings()
      .then((s) => {
        setSettingsState(s)
        setLoaded(true)
      })
      .catch(() => setError('Failed to load settings'))
  }, [])

  useEffect(() => {
    if (!listening) return

    function handleKeyDown(event: KeyboardEvent): void {
      const captured = captureKeyName(event)
      if (!captured) return
      event.preventDefault()
      applyCapturedKey(captured)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, settings])

  async function persist(next: AppSettings): Promise<void> {
    setSettingsState(next)
    try {
      await window.skyAPI.setSettings(next)
    } catch {
      setError('Failed to save settings')
    }
  }

  function findNoteKeyOwner(key: string, excludeId?: NoteKeyId): NoteKeyId | null {
    const entry = (Object.entries(settings.noteKeys) as [NoteKeyId, string][]).find(
      ([id, value]) => id !== excludeId && value === key
    )
    return entry ? entry[0] : null
  }

  function findHotkeyOwner(key: string, excludeAction?: TransportAction): TransportAction | null {
    const entry = (Object.entries(settings.transportHotkeys) as [TransportAction, string][]).find(
      ([action, value]) => action !== excludeAction && value === key
    )
    return entry ? entry[0] : null
  }

  function applyCapturedKey(key: string): void {
    if (!listening) return

    if (listening.kind === 'note') {
      const { id } = listening
      const dupNote = findNoteKeyOwner(key, id)
      const dupHotkey = findHotkeyOwner(key)
      if (dupNote) {
        setWarning(`"${key}" is already bound to cell ${dupNote}.`)
      } else if (dupHotkey) {
        setWarning(`"${key}" is already bound to the ${dupHotkey} hotkey.`)
      } else {
        setWarning(null)
        void persist({ ...settings, noteKeys: { ...settings.noteKeys, [id]: key } })
      }
    } else {
      const { action } = listening
      const dupHotkey = findHotkeyOwner(key, action)
      const dupNote = findNoteKeyOwner(key)
      if (dupHotkey) {
        setWarning(`"${key}" is already bound to the ${dupHotkey} hotkey.`)
      } else if (dupNote) {
        setWarning(`"${key}" is already bound to cell ${dupNote}.`)
      } else {
        setWarning(null)
        void persist({ ...settings, transportHotkeys: { ...settings.transportHotkeys, [action]: key } })
      }
    }

    setListening(null)
  }

  function startListeningNote(id: NoteKeyId): void {
    setWarning(null)
    setListening({ kind: 'note', id })
  }

  function startListeningHotkey(action: TransportAction): void {
    setWarning(null)
    setListening({ kind: 'hotkey', action })
  }

  function cancelListening(): void {
    setListening(null)
  }

  function resetNoteKeys(): void {
    setWarning(null)
    void persist({ ...settings, noteKeys: DEFAULT_NOTE_KEYS })
  }

  function resetHotkeys(): void {
    setWarning(null)
    void persist({ ...settings, transportHotkeys: DEFAULT_TRANSPORT_HOTKEYS })
  }

  async function handlePickFolder(): Promise<void> {
    try {
      const picked = await window.skyAPI.pickDataFolder()
      if (picked) {
        await persist({ ...settings, dataFolder: picked })
      }
    } catch {
      setError('Failed to open the folder picker')
    }
  }

  async function handleOpenFolder(): Promise<void> {
    try {
      await window.skyAPI.openDataFolder()
    } catch {
      setError('Failed to open the data folder')
    }
  }

  if (!loaded) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
        <p className="mt-2 text-sm text-slate-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">
          Remap note keys and transport hotkeys. Changes save automatically.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {warning && <p className="text-sm text-amber-400">{warning}</p>}
      {listening && (
        <div className="rounded border border-sky-700 bg-sky-900/40 px-3 py-2 text-sm text-sky-200">
          Press a key to bind it…{' '}
          <button onClick={cancelListening} className="ml-2 underline hover:text-white">
            Cancel
          </button>
        </div>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Note keys</h2>
          <button
            onClick={resetNoteKeys}
            className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600"
          >
            Reset to default
          </button>
        </div>
        <div className="inline-grid grid-cols-5 gap-1.5">
          {GRID_ROWS.flatMap((row) =>
            GRID_COLS.map((col) => {
              const id = `${row}${col}` as NoteKeyId
              const isListening = listening?.kind === 'note' && listening.id === id
              return (
                <button
                  key={id}
                  onClick={() => startListeningNote(id)}
                  aria-label={`Note key ${id}`}
                  className={`flex h-14 w-14 flex-col items-center justify-center rounded text-xs font-medium transition-colors ${
                    isListening
                      ? 'animate-pulse bg-sky-500 text-white ring-2 ring-sky-300'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <span className="opacity-60">{id}</span>
                  <span className="text-sm font-semibold">{isListening ? '…' : settings.noteKeys[id]}</span>
                </button>
              )
            })
          )}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Transport hotkeys</h2>
          <button
            onClick={resetHotkeys}
            className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600"
          >
            Reset to default
          </button>
        </div>
        <p className="mb-2 text-xs text-slate-500">
          These work globally, even while the app window is minimized during playback.
        </p>
        <div className="space-y-1.5">
          {TRANSPORT_ACTIONS.map(({ id, label }) => {
            const isListening = listening?.kind === 'hotkey' && listening.action === id
            return (
              <div
                key={id}
                className="flex items-center justify-between rounded border border-slate-800 px-3 py-2"
              >
                <span className="text-sm text-slate-300">{label}</span>
                <button
                  onClick={() => startListeningHotkey(id)}
                  className={`min-w-24 rounded px-3 py-1 text-sm font-medium ${
                    isListening
                      ? 'animate-pulse bg-sky-500 text-white ring-2 ring-sky-300'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {isListening ? 'Press a key…' : settings.transportHotkeys[id]}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm text-slate-300">
            Sustain threshold (ms)
            <input
              type="number"
              min={0}
              value={settings.sustainThresholdMs}
              onChange={(e) => void persist({ ...settings, sustainThresholdMs: Number(e.target.value) })}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
            />
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Notes held longer than this become sustained (held) presses during conversion, if the target
            instrument supports it.
          </p>
        </div>

        <div>
          <label className="block text-sm text-slate-300">
            Minimum tap press duration (ms)
            <input
              type="number"
              min={0}
              value={settings.minTapPressMs}
              onChange={(e) => void persist({ ...settings, minTapPressMs: Number(e.target.value) })}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
            />
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Floor applied to short tap keydown-to-keyup durations, so the OS/game doesn't miss them.
          </p>
        </div>

        <div>
          <label className="block text-sm text-slate-300">
            Countdown duration (seconds)
            <input
              type="number"
              min={0}
              value={settings.countdownSeconds}
              onChange={(e) => void persist({ ...settings, countdownSeconds: Number(e.target.value) })}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
            />
          </label>
          <p className="mt-1 text-xs text-slate-500">
            How long the on-screen countdown runs before playback starts, giving you time to alt-tab into Sky.
          </p>
        </div>

        <div>
          <label className="block text-sm text-slate-300">
            Target window title
            <input
              type="text"
              value={settings.targetWindowTitle}
              onChange={(e) => void persist({ ...settings, targetWindowTitle: e.target.value })}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
            />
          </label>
          <p className="mt-1 text-xs text-slate-500">
            The safety guard auto-pauses playback if the OS-focused window's title doesn't contain this text.
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Data folder</h2>
        <p className="text-sm text-slate-300">
          {settings.dataFolder ?? 'Using the default location (app data folder / songs).'}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => void handlePickFolder()}
            className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-600"
          >
            Choose folder…
          </button>
          <button
            onClick={() => void handleOpenFolder()}
            className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-600"
          >
            Open folder
          </button>
        </div>
      </section>
    </div>
  )
}
