import { useEffect, useState } from 'react'
import type { GridCol, GridRow } from '@shared/song'
import { DEFAULT_NOTE_KEYS, DEFAULT_TRANSPORT_HOTKEYS, type NoteKeyId, type TransportAction } from '@shared/keybinds'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/settings'
import { captureKeyName } from './keyCapture'
import { PageContainer, PageHeader } from '../../components/layout/Page'
import { Alert, Button, Card, Callout, Field, KeyCap, NumberInput, SectionHeading, TextInput } from '../../components/ui'
import { IconFolder, IconFolderOpen, IconStar } from '../../components/icons'

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
      <>
        <PageHeader title="Settings" />
        <PageContainer>
          <Card>
            <p className="text-sm text-moon-400">Loading…</p>
          </Card>
        </PageContainer>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Remap note keys and transport hotkeys. Changes save automatically."
      />

      <PageContainer>
        {error && <Alert tone="error">{error}</Alert>}
        {/* Single unsplit text node — Settings' test matches /already bound to cell A1/. */}
        {warning && <Alert tone="warning">{warning}</Alert>}

        {/* Note keys. This section must stay FIRST: the test resolves the
            note-key reset via getAllByText('Reset to default')[0]. */}
        <div className="grid gap-5 xl:grid-cols-[auto_1fr]">
          <Card>
            <SectionHeading
              level={3}
              eyebrow="The 15-key grid"
              title="Note keys"
              actions={
                <Button size="sm" onClick={resetNoteKeys}>
                  Reset to default
                </Button>
              }
            />
            <div className="paint-inset mt-4 inline-grid grid-cols-5 gap-2 rounded-card p-3">
              {GRID_ROWS.flatMap((row) =>
                GRID_COLS.map((col) => {
                  const id = `${row}${col}` as NoteKeyId
                  const isListening = listening?.kind === 'note' && listening.id === id
                  return (
                    <KeyCap
                      key={id}
                      id={id}
                      value={settings.noteKeys[id]}
                      listening={isListening}
                      ariaLabel={`Note key ${id}`}
                      onClick={() => startListeningNote(id)}
                    />
                  )
                })
              )}
            </div>
          </Card>

          <Card>
            <SectionHeading
              level={3}
              eyebrow="Global"
              title="Transport hotkeys"
              actions={
                <Button size="sm" onClick={resetHotkeys}>
                  Reset to default
                </Button>
              }
            />
            <Callout className="mt-3" icon={<IconStar size={14} />}>
              These work globally, even while the app window is minimized during playback.
            </Callout>
            <div className="mt-3 space-y-2">
              {TRANSPORT_ACTIONS.map(({ id, label }) => {
                const isListening = listening?.kind === 'hotkey' && listening.action === id
                return (
                  <div
                    key={id}
                    className="paint-inset flex items-center justify-between gap-3 rounded-tile px-3 py-2"
                  >
                    <span className="font-display text-sm font-semibold text-moon-200">{label}</span>
                    <button
                      onClick={() => startListeningHotkey(id)}
                      className={`min-w-24 rounded-tile px-3 py-1.5 text-sm font-semibold transition-colors ${
                        isListening
                          ? 'animate-pulse bg-star-500 text-night-950 ring-2 ring-star-200'
                          : 'bg-night-800/85 text-moon-200 shadow-cell ring-1 ring-cobalt-700/40 hover:bg-night-700/85'
                      }`}
                    >
                      {isListening ? 'Press a key…' : settings.transportHotkeys[id]}
                    </button>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        <Card>
          <SectionHeading level={3} eyebrow="Timing" title="Playback tuning" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              wrap
              label="Sustain threshold (ms)"
              hint="Notes held longer than this become sustained (held) presses during conversion, if the target instrument supports it."
            >
              <NumberInput
                min={0}
                value={settings.sustainThresholdMs}
                onChange={(e) => void persist({ ...settings, sustainThresholdMs: Number(e.target.value) })}
              />
            </Field>

            <Field
              wrap
              label="Minimum tap press duration (ms)"
              hint="Floor applied to short tap keydown-to-keyup durations, so the OS/game doesn't miss them."
            >
              <NumberInput
                min={0}
                value={settings.minTapPressMs}
                onChange={(e) => void persist({ ...settings, minTapPressMs: Number(e.target.value) })}
              />
            </Field>

            <Field
              wrap
              label="Countdown duration (seconds)"
              hint="How long the on-screen countdown runs before playback starts, giving you time to alt-tab into Sky."
            >
              <NumberInput
                min={0}
                value={settings.countdownSeconds}
                onChange={(e) => void persist({ ...settings, countdownSeconds: Number(e.target.value) })}
              />
            </Field>

            <Field
              wrap
              label="Target window title"
              hint="The safety guard auto-pauses playback if the OS-focused window's title doesn't contain this text."
            >
              <TextInput
                value={settings.targetWindowTitle}
                onChange={(e) => void persist({ ...settings, targetWindowTitle: e.target.value })}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <SectionHeading level={3} eyebrow="Library" title="Data folder" />
          <p className="paint-inset mt-3 truncate rounded-tile px-3 py-2 font-mono text-xs text-moon-300">
            {settings.dataFolder ?? 'Using the default location (app data folder / songs).'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button icon={<IconFolder size={15} />} onClick={() => void handlePickFolder()}>
              Choose folder…
            </Button>
            <Button icon={<IconFolderOpen size={15} />} onClick={() => void handleOpenFolder()}>
              Open folder
            </Button>
          </div>
        </Card>
      </PageContainer>

      {/* Floating capture prompt, so it stays visible wherever you scrolled to. */}
      {listening && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-6">
          <div className="paint-panel pointer-events-auto flex items-center gap-3 rounded-card px-4 py-2.5 backdrop-blur-md">
            <span className="animate-halo-breathe text-star-400">
              <IconStar size={18} />
            </span>
            <span className="text-sm text-moon-100">Press a key to bind it…</span>
            <Button size="sm" variant="ghost" onClick={cancelListening}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
