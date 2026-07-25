import { useEffect, useState } from 'react'
import type { GridCol, GridRow, SongMeta } from '@shared/song'
import type { PlaybackStatus } from '@shared/playback'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { PageContainer, PageHeader } from '../../components/layout/Page'
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  DropZone,
  EmptyState,
  IconButton,
  SectionHeading,
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

export function PlayMusicMode() {
  const [library, setLibrary] = useState<SongMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [status, setStatus] = useState<PlaybackStatus>(IDLE_STATUS)
  const [dryRun, setDryRun] = useState(true)
  const [tempoPercent, setTempoPercent] = useState(100)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [countdownSeconds, setCountdownSeconds] = useState(DEFAULT_SETTINGS.countdownSeconds)
  const [activeCells, setActiveCells] = useState<Set<string>>(new Set())
  const [noteLog, setNoteLog] = useState<string[]>([])
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
        const cellId = `${event.row}${event.col}`
        setActiveCells((prev) => {
          const next = new Set(prev)
          if (event.kind === 'down') next.add(cellId)
          else next.delete(cellId)
          return next
        })
        setNoteLog((prev) => [...prev.slice(-29), `${event.kind} ${cellId} @ ${Math.round(event.timeMs)}ms`])
      } else if (event.type === 'ended') {
        setActiveCells(new Set())
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
    setActiveCells(new Set())
    setNoteLog([])
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
    setActiveCells(new Set())
  }

  async function handlePanic(): Promise<void> {
    setCountdown(null)
    setStatus(await window.skyAPI.playbackPanic())
    setActiveCells(new Set())
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
        setActiveCells(new Set())
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
    setActiveCells(new Set())
    setStatus(await window.skyAPI.playbackSeek(targetMs))
  }

  const selectedMeta = library.find((s) => s.id === selectedId) ?? null
  const displayedElapsedMs = scrubMs ?? status.elapsedMs
  const playing = status.state === 'playing'

  return (
    <div className="flex h-full">
      {/* ── Library rail ───────────────────────────────────────────── */}
      <aside className="paint-panel scrollbar-night flex w-56 shrink-0 flex-col overflow-auto rounded-none border-y-0 border-l-0 p-3 lg:w-72">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-moon-100">Library</h2>
          {library.length > 0 && <Badge tone="gold">{library.length}</Badge>}
        </div>

        {library.length === 0 ? (
          <EmptyState
            className="px-2 py-6"
            icon={<IconStar size={26} />}
            title="No songs yet"
            description="Convert or arrange a MIDI, or drop a community sheet below."
          />
        ) : (
          <ul className="space-y-1.5">
            {library.map((meta) => {
              const selected = meta.id === selectedId
              return (
                <li key={meta.id} className="group flex items-center gap-1">
                  <button
                    onClick={() => void selectSong(meta)}
                    className={cn(
                      'min-w-0 flex-1 rounded-tile px-2.5 py-2 text-left transition-colors',
                      selected
                        ? 'brush-edge bg-cobalt-800/55 text-star-100'
                        : 'text-moon-200 hover:bg-night-800/60'
                    )}
                  >
                    <div className="truncate font-display text-sm font-semibold">{meta.title}</div>
                    {meta.artist && <div className="truncate text-xs text-moon-400">{meta.artist}</div>}
                  </button>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    label={`Delete ${meta.title} from library`}
                    icon={<IconTrash size={15} />}
                    onClick={() => void deleteFromLibrary(meta)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 hover:!bg-vermilion-700/40 hover:!text-vermilion-400"
                  />
                </li>
              )
            })}
          </ul>
        )}

        <DropZone
          compact
          multiple
          className="mt-4"
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
              <div className="flex items-center gap-2">
                {status.dryRun && <Badge tone="gold">Dry run</Badge>}
                <Badge tone={STATE_TONE[status.state]}>{status.state}</Badge>
              </div>
            ) : undefined
          }
        />

        <PageContainer>
          {error && <Alert tone="error">{error}</Alert>}

          {!selectedMeta ? (
            <Card padding="none">
              <EmptyState
                icon={<IconMusic size={30} />}
                title="Nothing loaded"
                description="Pick a song from the library to load it into the player."
              />
            </Card>
          ) : (
            <>
              {/* Now playing + seek */}
              <Card>
                <div className="font-display text-2xl leading-tight font-semibold text-moon-50">
                  {selectedMeta.title}
                </div>
                <div className="mt-0.5 text-sm text-moon-400">{selectedMeta.artist || 'Unknown artist'}</div>

                <div className="mt-5">
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
                  <div className="mt-1 flex justify-between font-mono text-xs text-moon-400">
                    <span>{formatMs(displayedElapsedMs)}</span>
                    <span>{formatMs(status.durationMs)}</span>
                  </div>
                </div>

                {/* Transport */}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button
                    icon={<IconPrev size={15} />}
                    onClick={() => void handleStep(-1)}
                    className="rounded-pill"
                  >
                    Previous
                  </Button>

                  <button
                    onClick={() => void handlePlayPause()}
                    disabled={countdown !== null}
                    aria-label={playing ? 'Pause' : 'Play'}
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-pill bg-star-400 text-night-950 shadow-star transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-45"
                  >
                    {playing ? <IconPause size={22} /> : <IconPlay size={22} />}
                  </button>

                  <Button
                    icon={<IconNext size={15} />}
                    onClick={() => void handleStep(1)}
                    className="rounded-pill"
                  >
                    Next
                  </Button>

                  <Button icon={<IconStop size={14} />} onClick={() => void handleStop()} className="rounded-pill">
                    Stop
                  </Button>

                  <span className="ml-auto flex items-center gap-3 border-l border-cobalt-700/30 pl-3">
                    <Button
                      variant="danger"
                      icon={<IconPanic size={15} />}
                      onClick={() => void handlePanic()}
                      className="rounded-pill"
                    >
                      Panic
                    </Button>
                  </span>
                </div>
              </Card>

              {/* Countdown */}
              {countdown !== null && (
                <Card className="text-center">
                  <p className="text-sm text-moon-300">
                    {status.dryRun
                      ? 'Starting dry-run preview…'
                      : 'Switch to the Sky window now — playback starts in'}
                  </p>
                  <div className="relative mx-auto mt-2 flex h-24 w-24 items-center justify-center">
                    <span className="absolute inset-0 animate-halo-breathe rounded-pill bg-star-400/35" />
                    <span className="relative font-display text-5xl font-semibold text-star-300">
                      {countdown}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => setCountdown(null)}>
                    Cancel
                  </Button>
                </Card>
              )}

              {/* Options */}
              <Card>
                <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                  <Checkbox
                    checked={dryRun}
                    onCheckedChange={(checked) => void handleDryRunChange(checked)}
                    label="Dry run"
                    hint="Preview only — no real keystrokes are sent to the game."
                  />
                  <label className="flex items-center gap-3 text-sm font-semibold text-moon-200">
                    Tempo
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
              </Card>

              {/* The 15-key grid — the showpiece. */}
              <Card>
                <SectionHeading level={3} eyebrow="Live" title="Grid preview" />
                <div className="mt-4 inline-grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-2">
                  <span />
                  {GRID_COLS.map((col) => (
                    <span key={col} className="text-center text-[10px] font-bold text-moon-500">
                      {col}
                    </span>
                  ))}
                  {GRID_ROWS.flatMap((row) => [
                    <span
                      key={`label-${row}`}
                      className="flex items-center pr-1 font-display text-xs font-bold text-moon-500"
                    >
                      {row}
                    </span>,
                    ...GRID_COLS.map((col) => {
                      const cellId = `${row}${col}`
                      const active = activeCells.has(cellId)
                      return (
                        <div key={cellId} className="relative flex h-14 w-14 items-center justify-center">
                          {active && (
                            <span className="absolute inset-0 animate-halo-breathe rounded-pill bg-star-400/40" />
                          )}
                          <div
                            className={cn(
                              'relative flex h-full w-full items-center justify-center rounded-pill text-xs font-semibold',
                              // Only transform/shadow are transitioned. Colour flips
                              // instantly: a 150ms colour fade never completes inside
                              // a ~150ms tap, which made struck cells read as rings.
                              'transition-[transform,box-shadow] duration-100',
                              active
                                ? 'animate-star-pop bg-star-400 text-night-950 shadow-star'
                                : 'bg-night-850/85 text-moon-500 shadow-cell ring-1 ring-cobalt-700/45'
                            )}
                          >
                            {cellId}
                          </div>
                        </div>
                      )
                    })
                  ])}
                </div>
              </Card>

              {/* Note log */}
              {noteLog.length > 0 && (
                <Card>
                  <SectionHeading level={3} eyebrow="Trace" title="Note log" />
                  <div className="paint-inset scrollbar-night mt-3 h-32 overflow-auto rounded-tile p-2.5 font-mono text-xs text-cobalt-300">
                    {noteLog.map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </PageContainer>
      </div>
    </div>
  )
}
