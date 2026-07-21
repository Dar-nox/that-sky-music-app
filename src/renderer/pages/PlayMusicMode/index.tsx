import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import type { GridCol, GridRow, SongMeta } from '@shared/song'
import type { PlaybackStatus } from '@shared/playback'
import { DEFAULT_SETTINGS } from '@shared/settings'

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
  const [isDragOver, setIsDragOver] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

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

  async function handleImportInputChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = event.target.files
    if (files && files.length > 0) {
      await importSheetFiles(files)
    }
    event.target.value = ''
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setIsDragOver(true)
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault()
    setIsDragOver(false)
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault()
    setIsDragOver(false)
    if (event.dataTransfer.files.length > 0) {
      await importSheetFiles(event.dataTransfer.files)
    }
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

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 overflow-auto border-r border-slate-800 p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Library</h2>
        {library.length === 0 && <p className="text-sm text-slate-500">No songs yet — convert or import one.</p>}
        <ul className="space-y-1">
          {library.map((meta) => (
            <li key={meta.id} className="group flex items-center gap-1">
              <button
                onClick={() => void selectSong(meta)}
                className={`min-w-0 flex-1 rounded px-2 py-1.5 text-left text-sm ${
                  meta.id === selectedId ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="truncate font-medium">{meta.title}</div>
                {meta.artist && <div className="truncate text-xs opacity-70">{meta.artist}</div>}
              </button>
              <button
                onClick={() => void deleteFromLibrary(meta)}
                title="Delete from library"
                aria-label={`Delete ${meta.title} from library`}
                className="shrink-0 rounded px-1.5 py-1 text-xs text-slate-500 opacity-0 hover:bg-red-900/40 hover:text-red-300 group-hover:opacity-100"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={(e) => void handleDrop(e)}
          className={`mt-3 rounded border border-dashed p-3 text-center text-xs ${
            isDragOver ? 'border-sky-400 bg-sky-900/30 text-sky-200' : 'border-slate-700 text-slate-500'
          }`}
        >
          <p>Drag & drop a .json/.txt sheet here</p>
          <p className="my-1">or</p>
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="rounded bg-slate-700 px-2 py-1 text-xs font-medium text-slate-100 hover:bg-slate-600 disabled:opacity-50"
          >
            {importing ? 'Importing…' : 'Import sheet file'}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,.txt"
            multiple
            onChange={(e) => void handleImportInputChange(e)}
            className="hidden"
          />
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6">
        <h1 className="text-xl font-semibold text-slate-100">Play Music Mode</h1>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        {!selectedMeta && (
          <p className="mt-4 text-sm text-slate-400">Select a song from the library to load it.</p>
        )}

        {selectedMeta && (
          <div className="mt-4 space-y-5">
            <div>
              <div className="text-lg font-medium text-slate-100">{selectedMeta.title}</div>
              <div className="text-sm text-slate-400">{selectedMeta.artist || 'Unknown artist'}</div>
            </div>

            <div>
              <input
                type="range"
                min={0}
                max={Math.max(status.durationMs, 1)}
                value={Math.min(displayedElapsedMs, Math.max(status.durationMs, 1))}
                onChange={(e) => setScrubMs(Number(e.target.value))}
                onMouseUp={() => void commitSeek()}
                onTouchEnd={() => void commitSeek()}
                onKeyUp={() => void commitSeek()}
                className="h-2 w-full cursor-pointer accent-sky-500"
              />
              <div className="mt-1 flex justify-between text-xs text-slate-400">
                <span>{formatMs(displayedElapsedMs)}</span>
                <span>{formatMs(status.durationMs)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => void handleStep(-1)}
                className="rounded bg-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-600"
              >
                ⏮ Previous
              </button>
              <button
                onClick={() => void handlePlayPause()}
                disabled={countdown !== null}
                className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {status.state === 'playing' ? 'Pause' : 'Play'}
              </button>
              <button
                onClick={() => void handleStep(1)}
                className="rounded bg-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-600"
              >
                Next ⏭
              </button>
              <button
                onClick={() => void handleStop()}
                className="rounded bg-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-600"
              >
                Stop
              </button>
              <button
                onClick={() => void handlePanic()}
                className="rounded bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
              >
                Panic
              </button>
            </div>

            {countdown !== null && (
              <div className="rounded border border-sky-700 bg-sky-900/40 p-4 text-center">
                <p className="text-sm text-slate-300">
                  {status.dryRun
                    ? 'Starting dry-run preview…'
                    : 'Switch to the Sky window now — playback starts in'}
                </p>
                <p className="text-3xl font-bold text-sky-300">{countdown}</p>
                <button
                  onClick={() => setCountdown(null)}
                  className="mt-1 text-xs text-slate-400 underline hover:text-slate-200"
                >
                  Cancel
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => void handleDryRunChange(e.target.checked)}
                />
                Dry run (preview only, no real keystrokes)
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-300">
                Tempo
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={tempoPercent}
                  onChange={(e) => void handleTempoChange(Number(e.target.value))}
                  className="w-40"
                />
                <span className="w-10 text-right">{tempoPercent}%</span>
              </label>
            </div>

            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Grid preview
              </h2>
              <div className="inline-grid grid-cols-5 gap-1.5">
                {GRID_ROWS.flatMap((row) =>
                  GRID_COLS.map((col) => {
                    const cellId = `${row}${col}`
                    const active = activeCells.has(cellId)
                    return (
                      <div
                        key={cellId}
                        className={`flex h-10 w-10 items-center justify-center rounded text-xs font-medium ${
                          active ? 'bg-sky-400 text-slate-900' : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {cellId}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {noteLog.length > 0 && (
              <div>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Note log
                </h2>
                <div className="h-32 overflow-auto rounded border border-slate-800 bg-slate-950 p-2 font-mono text-xs text-slate-400">
                  {noteLog.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
