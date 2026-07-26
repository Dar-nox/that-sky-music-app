import { memo, useEffect, useState } from 'react'
import type { GridCol, GridRow, SongMeta } from '@shared/song'
import type { PlaybackStatus } from '@shared/playback'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { PageContainer, PageHeader } from '../../components/layout/Page'
import { usePlaybackStore } from '../../store/playbackStore'
import {
  Alert,
  Annotation,
  Button,
  Checkbox,
  DropZone,
  EmptyState,
  IconButton,
  PaintRule,
  Plate,
  Slider,
  cn
} from '../../components/ui'
import {
  IconMusic,
  IconNext,
  IconPanic,
  IconPause,
  IconPlay,
  IconPrev,
  IconStar,
  IconStop,
  IconTrash
} from '../../components/icons'

const GRID_ROWS: GridRow[] = ['A', 'B', 'C']
const GRID_COLS: GridCol[] = [1, 2, 3, 4, 5]

const IDLE_STATUS: PlaybackStatus = {
  state: 'idle',
  songId: null,
  elapsedMs: 0,
  durationMs: 0,
  tempoMultiplier: 1,
  dryRun: true
}

const STATE_TONE = {
  playing: 'good',
  paused: 'warn',
  stopped: 'neutral',
  idle: 'neutral'
} as const

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/* ---------------------------------------------------------------------------
 * The two live surfaces.
 *
 * Both are `memo`'d and read the playback store directly rather than taking
 * props, so a note event re-renders these and nothing above them. See
 * `store/playbackStore.ts` for why that matters.
 * ------------------------------------------------------------------------ */

const GridPreview = memo(function GridPreview(): React.JSX.Element {
  const activeCells = usePlaybackStore((s) => s.activeCells)

  return (
    <Plate>
      <h3 className="mb-5 font-display text-lg font-medium text-moon-300 italic">Grid</h3>
      <div className="inline-grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-2.5">
        <span />
        {GRID_COLS.map((col) => (
          <span key={col} className="text-center text-[0.65rem] text-moon-500">
            {col}
          </span>
        ))}
        {GRID_ROWS.flatMap((row) => [
          <span key={`label-${row}`} className="flex items-center pr-2 font-display text-xs text-moon-500">
            {row}
          </span>,
          ...GRID_COLS.map((col) => {
            const cellId = `${row}${col}`
            const active = activeCells.has(cellId)
            return (
              <div key={cellId} className="relative flex h-14 w-14 items-center justify-center">
                {active && <span className="absolute inset-0 animate-halo-breathe rounded-pill bg-star-400/40" />}
                <div
                  className={cn(
                    'relative flex h-full w-full items-center justify-center rounded-pill text-xs font-semibold',
                    // Only transform/shadow are transitioned. Colour flips
                    // instantly: a 150ms colour fade never completes inside
                    // a ~150ms tap, which made struck cells read as rings.
                    'transition-[transform,box-shadow] duration-100',
                    active
                      ? 'animate-star-pop bg-star-400 text-night-950 shadow-star'
                      : 'bg-night-850/80 text-moon-500 shadow-cell ring-1 ring-cobalt-700/40'
                  )}
                >
                  {cellId}
                </div>
              </div>
            )
          })
        ])}
      </div>
    </Plate>
  )
})

const NoteLog = memo(function NoteLog(): React.JSX.Element | null {
  const noteLog = usePlaybackStore((s) => s.noteLog)
  if (noteLog.length === 0) return null

  return (
    <Plate>
      <h3 className="mb-4 font-display text-lg font-medium text-moon-300 italic">Note log</h3>
      <div className="paint-inset scrollbar-night h-32 overflow-auto rounded-tile p-3 font-mono text-xs text-cobalt-300">
        {noteLog.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </Plate>
  )
})

/* ------------------------------------------------------------------------ */

export function PlayMusicMode() {
  const [library, setLibrary] = useState<SongMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [status, setStatus] = useState<PlaybackStatus>(IDLE_STATUS)
  const [dryRun, setDryRun] = useState(true)
  const [tempoPercent, setTempoPercent] = useState(100)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [countdownSeconds, setCountdownSeconds] = useState(DEFAULT_SETTINGS.countdownSeconds)
  const [error, setError] = useState<string | null>(null)
  const [scrubMs, setScrubMs] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    window.skyAPI.listLibrary().then(setLibrary).catch(() => setError('Failed to load library'))
    window.skyAPI
      .getSettings()
      .then((settings) => setCountdownSeconds(settings.countdownSeconds))
      .catch(() => {
        // Keep the shared default if settings can't be loaded yet.
      })
  }, [])

  useEffect(() => {
    return window.skyAPI.onPlaybackEvent((event) => {
      if (event.type === 'status') {
        setStatus(event.status)
      } else if (event.type === 'note') {
        // Straight into the store — this fires ~20x/second and must not
        // re-render this component.
        usePlaybackStore.getState().noteEvent(event.kind, event.row, event.col, event.timeMs)
      } else if (event.type === 'ended') {
        usePlaybackStore.getState().releaseAll()
      } else if (event.type === 'error') {
        setError(event.message)
      }
    })
  }, [])

  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      setCountdown(null)
      window.skyAPI.playbackPlay().then(setStatus).catch((err) => setError(String(err)))
      return
    }
    const timer = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  async function selectSong(meta: SongMeta): Promise<void> {
    setError(null)
    usePlaybackStore.getState().reset()
    setCountdown(null)
    setScrubMs(null)
    try {
      const song = await window.skyAPI.loadSong(meta.id)
      const newStatus = await window.skyAPI.playbackLoad(song, dryRun)
      setSelectedId(meta.id)
      setStatus(newStatus)
      setTempoPercent(Math.round(newStatus.tempoMultiplier * 100))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load song')
    }
  }

  async function handlePlayPause(): Promise<void> {
    if (status.state === 'playing') {
      setStatus(await window.skyAPI.playbackPause())
    } else if (status.state === 'paused') {
      setStatus(await window.skyAPI.playbackPlay())
    } else if (status.state === 'stopped') {
      setCountdown(countdownSeconds)
    }
  }

  async function handleStop(): Promise<void> {
    setCountdown(null)
    setStatus(await window.skyAPI.playbackStop())
    usePlaybackStore.getState().releaseAll()
  }

  async function handlePanic(): Promise<void> {
    setCountdown(null)
    setStatus(await window.skyAPI.playbackPanic())
    usePlaybackStore.getState().releaseAll()
  }

  async function handleStep(direction: 1 | -1): Promise<void> {
    if (library.length === 0) return
    const currentIndex = library.findIndex((s) => s.id === selectedId)
    const nextIndex = ((currentIndex === -1 ? 0 : currentIndex) + direction + library.length) % library.length
    await selectSong(library[nextIndex])
  }

  async function handleTempoChange(percent: number): Promise<void> {
    setTempoPercent(percent)
    setStatus(await window.skyAPI.playbackSetTempo(percent / 100))
  }

  async function handleDryRunChange(checked: boolean): Promise<void> {
    setDryRun(checked)
    setStatus(await window.skyAPI.playbackSetDryRun(checked))
  }

  async function refreshLibrary(): Promise<void> {
    try {
      setLibrary(await window.skyAPI.listLibrary())
    } catch {
      setError('Failed to refresh library')
    }
  }

  async function deleteFromLibrary(meta: SongMeta): Promise<void> {
    if (!window.confirm(`Delete "${meta.title}" from your library? This can't be undone.`)) return

    try {
      if (meta.id === selectedId) {
        setCountdown(null)
        await window.skyAPI.playbackStop()
        setStatus(IDLE_STATUS)
        usePlaybackStore.getState().reset()
        setSelectedId(null)
      }
      await window.skyAPI.deleteSong(meta.id)
      await refreshLibrary()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete song')
    }
  }

  /** Imports one or more external community sheet files (Sky Studio / sky-music JSON,
   * per CLAUDE.md §5/§7) via the file picker or drag-and-drop, normalizes + saves each
   * through the `importSheet` IPC channel, then refreshes the library list. */
  async function importSheetFiles(files: FileList | File[]): Promise<void> {
    const list = Array.from(files).filter((f) => /\.(json|txt)$/i.test(f.name))
    if (list.length === 0) {
      setError('Only .json or .txt sheet files can be imported')
      return
    }

    setImporting(true)
    setError(null)

    let importedCount = 0
    let lastFailure: string | null = null

    for (const file of list) {
      try {
        const text = await file.text()
        await window.skyAPI.importSheet(text, file.name)
        importedCount++
      } catch (err) {
        lastFailure = `${file.name}: ${err instanceof Error ? err.message : 'Import failed'}`
      }
    }

    if (importedCount > 0) {
      await refreshLibrary()
    }
    if (lastFailure) {
      const failedCount = list.length - importedCount
      setError(failedCount > 1 ? `${failedCount} file(s) failed to import. Last error -- ${lastFailure}` : lastFailure)
    }

    setImporting(false)
  }

  async function commitSeek(): Promise<void> {
    if (scrubMs === null) return
    const targetMs = scrubMs
    setScrubMs(null)
    usePlaybackStore.getState().releaseAll()
    setStatus(await window.skyAPI.playbackSeek(targetMs))
  }

  const selectedMeta = library.find((s) => s.id === selectedId) ?? null
  const displayedElapsedMs = scrubMs ?? status.elapsedMs
  const playing = status.state === 'playing'

  return (
    <div className="flex h-full">
      {/* ── Library index ──────────────────────────────────────────
          Not a second sidebar: with the masthead carrying navigation, this
          column is the page's own index of what there is to play. */}
      <aside className="scrollbar-night flex w-60 shrink-0 flex-col overflow-auto border-r border-cobalt-700/20 px-5 py-7 lg:w-72">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-xl font-medium text-moon-100 italic">Library</h2>
          {library.length > 0 && <Annotation tone="gold">{library.length}</Annotation>}
        </div>
        <PaintRule className="mt-4" />

        {library.length === 0 ? (
          <EmptyState
            className="px-0 py-8"
            icon={<IconStar size={24} />}
            title="No songs yet"
            description="Convert or arrange a MIDI, or drop a community sheet below."
          />
        ) : (
          <ul className="mt-5 space-y-1">
            {library.map((meta) => {
              const selected = meta.id === selectedId
              return (
                <li key={meta.id} className="group flex items-center gap-1">
                  <button
                    onClick={() => void selectSong(meta)}
                    className={cn(
                      'min-w-0 flex-1 py-2 pl-3 text-left transition-colors',
                      selected ? 'brush-edge text-star-100' : 'text-moon-300 hover:text-moon-50'
                    )}
                  >
                    <div className="truncate font-display text-sm font-medium">{meta.title}</div>
                    {meta.artist && <div className="mt-0.5 truncate text-xs text-moon-500">{meta.artist}</div>}
                  </button>
                  <IconButton
                    label={`Delete ${meta.title} from library`}
                    icon={<IconTrash size={15} />}
                    onClick={() => void deleteFromLibrary(meta)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-vermilion-400"
                  />
                </li>
              )
            })}
          </ul>
        )}

        <DropZone
          compact
          multiple
          className="mt-8"
          accept=".json,.txt"
          busy={importing}
          busyLabel="Importing…"
          title="Drop a sheet here"
          hint=".json / .txt from Sky Studio or sky-music"
          buttonLabel="Import sheet file"
          onFiles={(files) => importSheetFiles(files)}
        />
      </aside>

      {/* ── Player ─────────────────────────────────────────────────── */}
      <div className="scrollbar-night min-w-0 flex-1 overflow-auto">
        <PageHeader
          title="Play Music Mode"
          actions={
            selectedMeta ? (
              <div className="flex items-center gap-4">
                {status.dryRun && <Annotation tone="gold">Dry run</Annotation>}
                <Annotation tone={STATE_TONE[status.state]}>{status.state}</Annotation>
              </div>
            ) : undefined
          }
        />

        <PageContainer className="space-y-10">
          {error && <Alert tone="error">{error}</Alert>}

          {!selectedMeta ? (
            <EmptyState
              icon={<IconMusic size={30} />}
              title="Nothing loaded"
              description="Pick a song from the library to load it into the player."
            />
          ) : (
            <>
              {/* Now playing — the song title is the largest thing on the page,
                  because it is what the page is about. */}
              <div>
                <div className="font-display text-4xl leading-tight font-semibold text-moon-50">
                  {selectedMeta.title}
                </div>
                <div className="mt-1.5 font-display text-base text-moon-400 italic">
                  {selectedMeta.artist || 'Unknown artist'}
                </div>

                <div className="mt-8">
                  <Slider
                    min={0}
                    max={Math.max(status.durationMs, 1)}
                    value={Math.min(displayedElapsedMs, Math.max(status.durationMs, 1))}
                    onChange={(e) => setScrubMs(Number(e.target.value))}
                    onMouseUp={() => void commitSeek()}
                    onTouchEnd={() => void commitSeek()}
                    onKeyUp={() => void commitSeek()}
                    className="w-full"
                  />
                  <div className="mt-1.5 flex justify-between font-mono text-xs text-moon-500">
                    <span>{formatMs(displayedElapsedMs)}</span>
                    <span>{formatMs(status.durationMs)}</span>
                  </div>
                </div>

                {/* Transport. The play button is the one circle in the app that
                    earns its shape — and the one thing that earns a glow. */}
                <div className="mt-8 flex flex-wrap items-center gap-7">
                  <Button icon={<IconPrev size={15} />} onClick={() => void handleStep(-1)}>
                    Previous
                  </Button>

                  <button
                    onClick={() => void handlePlayPause()}
                    disabled={countdown !== null}
                    aria-label={playing ? 'Pause' : 'Play'}
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-pill bg-star-400 text-night-950 shadow-star transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-45"
                  >
                    {playing ? <IconPause size={24} /> : <IconPlay size={24} />}
                  </button>

                  <Button icon={<IconNext size={15} />} onClick={() => void handleStep(1)}>
                    Next
                  </Button>

                  <Button icon={<IconStop size={14} />} onClick={() => void handleStop()}>
                    Stop
                  </Button>

                  <span className="ml-auto">
                    <Button variant="danger" icon={<IconPanic size={15} />} onClick={() => void handlePanic()}>
                      Panic
                    </Button>
                  </span>
                </div>
              </div>

              {countdown !== null && (
                <div className="hairline-top pt-8 text-center">
                  <p className="text-sm text-moon-300">
                    {status.dryRun
                      ? 'Starting dry-run preview…'
                      : 'Switch to the Sky window now — playback starts in'}
                  </p>
                  <div className="relative mx-auto mt-4 flex h-24 w-24 items-center justify-center">
                    <span className="absolute inset-0 animate-halo-breathe rounded-pill bg-star-400/35" />
                    <span className="relative font-display text-5xl font-semibold text-star-300">{countdown}</span>
                  </div>
                  <Button variant="ghost" size="sm" className="mt-4" onClick={() => setCountdown(null)}>
                    Cancel
                  </Button>
                </div>
              )}

              <div className="hairline-top flex flex-wrap items-center gap-x-12 gap-y-5 pt-8">
                <Checkbox
                  checked={dryRun}
                  onCheckedChange={(checked) => void handleDryRunChange(checked)}
                  label="Dry run"
                  hint="Preview only — no real keystrokes are sent to the game."
                />
                <label className="flex items-center gap-4 text-sm text-moon-200">
                  <span className="smallcaps text-[0.82rem]">Tempo</span>
                  <Slider
                    min={50}
                    max={150}
                    value={tempoPercent}
                    onChange={(e) => void handleTempoChange(Number(e.target.value))}
                    className="w-40"
                  />
                  <span className="w-11 text-right font-mono text-xs text-star-300">{tempoPercent}%</span>
                </label>
              </div>

              <GridPreview />
              <NoteLog />
            </>
          )}
        </PageContainer>
      </div>
    </div>
  )
}
