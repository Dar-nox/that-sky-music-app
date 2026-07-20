import { useEffect, useState } from 'react'
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

  const selectedMeta = library.find((s) => s.id === selectedId) ?? null
  const progressPct = status.durationMs > 0 ? Math.min(100, (status.elapsedMs / status.durationMs) * 100) : 0

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 overflow-auto border-r border-slate-800 p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Library</h2>
        {library.length === 0 && <p className="text-sm text-slate-500">No songs yet — convert or import one.</p>}
        <ul className="space-y-1">
          {library.map((meta) => (
            <li key={meta.id}>
              <button
                onClick={() => void selectSong(meta)}
                className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                  meta.id === selectedId ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="truncate font-medium">{meta.title}</div>
                {meta.artist && <div className="truncate text-xs opacity-70">{meta.artist}</div>}
              </button>
            </li>
          ))}
        </ul>
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
              <div className="h-2 w-full overflow-hidden rounded bg-slate-800">
                <div className="h-full bg-sky-500" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-xs text-slate-400">
                <span>{formatMs(status.elapsedMs)}</span>
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
