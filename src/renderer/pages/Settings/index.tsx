import { useEffect, useState } from 'react'
import type { GridCol, GridRow } from '@shared/song'
import { DEFAULT_NOTE_KEYS, DEFAULT_TRANSPORT_HOTKEYS, type NoteKeyId, type TransportAction } from '@shared/keybinds'
import { DEFAULT_SETTINGS, type AppSettings, type BackgroundQuality } from '@shared/settings'
import { captureKeyName } from './keyCapture'
import { PageContainer, PageHeader } from '../../components/layout/Page'
import { useAppearanceStore } from '../../store/appearanceStore'
import {
  Alert,
  Button,
  Callout,
  Field,
  KeyCap,
  Movement,
  NumberInput,
  Plate,
  RadioGroup,
  TextInput
} from '../../components/ui'
import { IconFolder, IconFolderOpen, IconStar } from '../../components/icons'

const GRID_ROWS: GridRow[] = ['A', 'B', 'C']
const GRID_COLS: GridCol[] = [1, 2, 3, 4, 5]

const TRANSPORT_ACTIONS: { id: TransportAction; label: string }[] = [
  { id: 'playPause', label: 'Play / Pause' },
  { id: 'next', label: 'Next song' },
  { id: 'previous', label: 'Previous song' },
  { id: 'panic', label: 'Panic stop' }
]

const BACKGROUND_OPTIONS: { value: BackgroundQuality; label: string; hint: string }[] = [
  {
    value: 'painting',
    label: 'Painting',
    hint: 'The sky drifts and the stars twinkle. The painting is rasterized once at startup and the moving layers just show that image, so this measures the same 60fps as the other two — it only costs a little more graphics memory.'
  },
  {
    value: 'still',
    label: 'Still',
    hint: 'The whole painting, holding completely still. Costs nothing after the first frame.'
  },
  { value: 'plain', label: 'Plain wash', hint: 'The colour gradient alone, with no painting at all.' }
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

  /** Kept in the store as well as on disk, so the backdrop changes as you pick
   *  rather than on the next launch. */
  function setBackgroundQuality(quality: BackgroundQuality): void {
    useAppearanceStore.getState().setBackgroundQuality(quality)
    void persist({ ...settings, backgroundQuality: quality })
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
          <p className="text-sm text-moon-400">Loading…</p>
        </PageContainer>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Settings" description="Remap note keys and transport hotkeys. Changes save automatically." />

      <PageContainer>
        {error && <Alert tone="error" className="mb-8">{error}</Alert>}
        {/* Single unsplit text node — Settings' test matches /already bound to cell A1/. */}
        {warning && <Alert tone="warning" className="mb-8">{warning}</Alert>}

        {/* Note keys. This section must stay FIRST: the test resolves the
            note-key reset via getAllByText('Reset to default')[0]. */}
        <Movement
          title="Note keys"
          description="The 15-key grid, as your game binds it. Click a cell, then press the key you want on it."
          actions={
            <Button size="sm" onClick={resetNoteKeys}>
              Reset to default
            </Button>
          }
        >
          <Plate className="w-fit" padding="sm">
            <div className="grid grid-cols-5 gap-2.5">
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
          </Plate>
        </Movement>

        <Movement
          title="Transport hotkeys"
          actions={
            <Button size="sm" onClick={resetHotkeys}>
              Reset to default
            </Button>
          }
        >
          <div className="max-w-lg">
            {TRANSPORT_ACTIONS.map(({ id, label }, i) => {
              const isListening = listening?.kind === 'hotkey' && listening.action === id
              return (
                <div
                  key={id}
                  // The rule goes *between* rows. Applied conditionally rather
                  // than as `first:border-t-0`, which would depend on which of
                  // two same-specificity utilities Tailwind happened to emit last.
                  className={`flex items-center justify-between gap-6 py-3 ${i > 0 ? 'hairline-top' : ''}`}
                >
                  <span className="text-sm text-moon-200">{label}</span>
                  <button
                    onClick={() => startListeningHotkey(id)}
                    className={`min-w-28 rounded-tile px-3 py-1.5 font-display text-sm font-semibold transition-colors ${
                      isListening
                        ? 'animate-pulse bg-star-400 text-night-950'
                        : 'bg-night-900/70 text-moon-200 shadow-cell ring-1 ring-cobalt-700/35 hover:bg-night-800/80'
                    }`}
                  >
                    {isListening ? 'Press a key…' : settings.transportHotkeys[id]}
                  </button>
                </div>
              )
            })}
          </div>
          <Callout className="mt-6" icon={<IconStar size={14} />}>
            These work globally, even while the app window is minimized during playback.
          </Callout>
        </Movement>

        <Movement title="Playback tuning">
          <div className="grid max-w-3xl gap-x-12 gap-y-8 sm:grid-cols-2">
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
        </Movement>

        <Movement title="Appearance">
          <Field
            label="Background"
            hint="Turn this down if the window feels sluggish — on an older laptop the moving painting is the most expensive thing the app draws."
          >
            <RadioGroup
              name="background-quality"
              value={settings.backgroundQuality}
              onChange={setBackgroundQuality}
              options={BACKGROUND_OPTIONS}
            />
          </Field>
          <p className="mt-4 max-w-[62ch] text-xs leading-relaxed text-moon-500">
            {BACKGROUND_OPTIONS.find((o) => o.value === settings.backgroundQuality)?.hint}
          </p>
        </Movement>

        <Movement title="Data folder" rule={false}>
          <p className="max-w-3xl truncate font-mono text-xs text-moon-400">
            {settings.dataFolder ?? 'Using the default location (app data folder / songs).'}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-7">
            <Button icon={<IconFolder size={15} />} onClick={() => void handlePickFolder()}>
              Choose folder…
            </Button>
            <Button icon={<IconFolderOpen size={15} />} onClick={() => void handleOpenFolder()}>
              Open folder
            </Button>
          </div>
        </Movement>
      </PageContainer>

      {/* Floating capture prompt, so it stays visible wherever you scrolled to.
          Opaque rather than blurred: a `backdrop-filter` here would re-blur its
          region every frame the backdrop moves. */}
      {listening && (
        <div className="pointer-events-none fixed inset-x-0 bottom-8 z-30 flex justify-center px-6">
          <div className="paint-plate pointer-events-auto relative flex items-center gap-4 bg-night-900/95 px-6 py-3">
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
