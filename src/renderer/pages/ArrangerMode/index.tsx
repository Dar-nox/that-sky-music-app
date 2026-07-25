import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  DEFAULT_ARRANGE_OPTIONS,
  type AccompanimentMode,
  type ArrangeOptions,
  type MelodyPlacement,
  type WindowMode
} from '@shared/arranger'
import { MAJOR_KEY_NAMES, majorRootPcToKeyName, parseKeyToMajorRootPc, type ParsedMidi } from '@shared/midi'
import type { Song } from '@shared/song'
import { DEFAULT_SETTINGS } from '@shared/settings'

function normalizeToMajorKeyName(key: string): string {
  try {
    return majorRootPcToKeyName(parseKeyToMajorRootPc(key))
  } catch {
    return 'C'
  }
}

function formatMmSs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const ACCOMPANIMENTS: { value: AccompanimentMode; label: string; hint: string }[] = [
  { value: 'full', label: 'Full', hint: 'A voicing under every melody note — recommended' },
  { value: 'bass', label: 'Bass only', hint: 'Just the bass line under the melody' },
  { value: 'none', label: 'None', hint: 'Melody alone — the cleanest, most reliable result' }
]

export function ArrangerMode() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null)
  const [parsed, setParsed] = useState<ParsedMidi | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [selectedTrackIndices, setSelectedTrackIndices] = useState<number[]>([0])
  const [autoKey, setAutoKey] = useState(DEFAULT_ARRANGE_OPTIONS.autoKey)
  const [key, setKey] = useState('C')
  const [autoMelodyTrack, setAutoMelodyTrack] = useState(DEFAULT_ARRANGE_OPTIONS.autoMelodyTrack)
  const [melodyTrackIndex, setMelodyTrackIndex] = useState<number | null>(
    DEFAULT_ARRANGE_OPTIONS.melodyTrackIndex
  )
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [sustainCapable, setSustainCapable] = useState(false)
  const [sustainThresholdMs, setSustainThresholdMs] = useState(DEFAULT_SETTINGS.sustainThresholdMs)
  const [maxChordNotes, setMaxChordNotes] = useState(DEFAULT_ARRANGE_OPTIONS.maxChordNotes)
  const [accompaniment, setAccompaniment] = useState<AccompanimentMode>(
    DEFAULT_ARRANGE_OPTIONS.accompaniment
  )
  const [windowMode, setWindowMode] = useState<WindowMode>(DEFAULT_ARRANGE_OPTIONS.windowMode)
  const [melodyPlacement, setMelodyPlacement] = useState<MelodyPlacement>(
    DEFAULT_ARRANGE_OPTIONS.melodyPlacement
  )
  const [keySegmentation, setKeySegmentation] = useState(DEFAULT_ARRANGE_OPTIONS.keySegmentation)
  const [responsiveWindowing, setResponsiveWindowing] = useState(
    DEFAULT_ARRANGE_OPTIONS.responsiveWindowing
  )

  const [arranging, setArranging] = useState(false)
  const [song, setSong] = useState<Song | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [exportingDev, setExportingDev] = useState(false)
  const [devExportPaths, setDevExportPaths] = useState<{ raw: string; arranged: string } | null>(null)

  useEffect(() => {
    window.skyAPI
      .getSettings()
      .then((settings) => setSustainThresholdMs(settings.sustainThresholdMs))
      .catch(() => {
        // Keep the shared default if settings can't be loaded yet.
      })
  }, [])

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)
    setSong(null)
    setSavedPath(null)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const result = await window.skyAPI.parseMidi(arrayBuffer)

      setFileName(file.name)
      setBuffer(arrayBuffer)
      setParsed(result)
      // Piano MIDIs usually arrive split across treble/bass tracks, and the arranger is built
      // for full chords — so default to every track that actually has notes.
      const withNotes = result.tracks.filter((t) => t.noteCount > 0).map((t) => t.index)
      setSelectedTrackIndices(withNotes.length > 0 ? withNotes : [result.suggestedTrackIndex])
      setKey(normalizeToMajorKeyName(result.detectedKey ?? result.estimatedKey))
      setTitle(file.name.replace(/\.(mid|midi)$/i, ''))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse MIDI file')
      setParsed(null)
      setBuffer(null)
      setFileName(null)
    }
  }

  function toggleTrack(index: number): void {
    const wasSelected = selectedTrackIndices.includes(index)
    setSelectedTrackIndices((prev) =>
      wasSelected ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b)
    )
    // A pin only makes sense while its track is part of the arrangement.
    if (wasSelected && melodyTrackIndex === index) {
      setAutoMelodyTrack(true)
      setMelodyTrackIndex(null)
    }
  }

  function buildOptions(): ArrangeOptions {
    return {
      trackIndices: selectedTrackIndices,
      key,
      autoKey,
      autoMelodyTrack,
      melodyTrackIndex,
      sustainCapable,
      sustainThresholdMs,
      maxChordNotes,
      accompaniment,
      windowMode,
      melodyPlacement,
      keySegmentation,
      responsiveWindowing,
      sourceFileName: fileName ?? 'unknown.mid',
      title: title || 'Untitled',
      artist
    }
  }

  async function handleArrange(): Promise<void> {
    if (!buffer || !parsed || selectedTrackIndices.length === 0) return

    setArranging(true)
    setError(null)
    setSong(null)
    setSavedPath(null)
    setDevExportPaths(null)

    const options = buildOptions()

    try {
      const result = await window.skyAPI.arrangeMidi(buffer, options)
      setSong(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Arranging failed')
    } finally {
      setArranging(false)
    }
  }

  async function handleSave(): Promise<void> {
    if (!song) return

    setSaving(true)
    setError(null)

    try {
      const path = await window.skyAPI.saveSong(song)
      setSavedPath(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save song')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Dev-only: writes the unaltered MIDI parse and this arrangement side by side into
   * dev-exports/, for manually comparing what the Arranger changed against the source.
   */
  async function handleDevExport(): Promise<void> {
    if (!buffer || !song) return

    setExportingDev(true)
    setError(null)

    try {
      const baseName = fileName ?? 'unknown.mid'
      const diagnostics = await window.skyAPI.arrangeMidiDiagnostics(buffer, buildOptions())
      const [raw, arranged] = await Promise.all([
        window.skyAPI.devExportRawMidi(buffer, baseName),
        window.skyAPI.devExportJson(song, baseName, 'arranged', diagnostics)
      ])
      setDevExportPaths({ raw, arranged })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dev export failed')
    } finally {
      setExportingDev(false)
    }
  }

  const report = song?.meta.arrangement

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold text-slate-100">Sky Music Arranger</h1>
      <p className="mt-2 text-sm text-slate-400">
        Where Convert Mode transcribes a MIDI note-for-note, the Arranger repositions it to suit a
        15-key diatonic instrument: it anchors the playable octave range on the melody, folds the
        accompaniment around it, and reduces chords to the notes that actually carry the harmony.
        It never touches note timing or duration — only where each note lands on the grid.
      </p>

      <div className="mt-6">
        <label className="block text-sm font-medium text-slate-300">MIDI file</label>
        <input
          type="file"
          accept=".mid,.midi"
          onChange={(e) => void handleFileChange(e)}
          className="mt-1 block w-full text-sm text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-sky-500"
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {parsed && (
        <div className="mt-6 space-y-4 rounded border border-slate-700 bg-slate-800/50 p-4">
          <div>
            <label className="block text-sm font-medium text-slate-300">Tracks to arrange</label>
            <p className="mt-0.5 text-xs text-slate-500">
              All tracks with notes are selected by default — the arranger is built to blend a
              piano file's separate treble and bass tracks into one playable texture.
            </p>
            <div className="mt-1 space-y-1 rounded border border-slate-600 bg-slate-900 p-2">
              {parsed.tracks.map((t) => (
                <label key={t.index} className="flex items-center gap-1.5 text-sm text-slate-100">
                  <input
                    type="checkbox"
                    checked={selectedTrackIndices.includes(t.index)}
                    onChange={() => toggleTrack(t.index)}
                  />
                  {t.name} ({t.noteCount} notes)
                </label>
              ))}
            </div>
            {selectedTrackIndices.length === 0 && (
              <p className="mt-1 text-xs text-red-400">Select at least one track.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">Melody track</label>
            <p className="mt-0.5 text-xs text-slate-500">
              Which track carries the tune. Pinning it stops a momentarily higher accompaniment
              note (a chord voicing, a grace note) from stealing the melody role mid-phrase.
            </p>
            <select
              value={autoMelodyTrack ? 'auto' : melodyTrackIndex === null ? 'none' : String(melodyTrackIndex)}
              onChange={(e) => {
                const value = e.target.value
                if (value === 'auto') {
                  setAutoMelodyTrack(true)
                  setMelodyTrackIndex(null)
                } else if (value === 'none') {
                  setAutoMelodyTrack(false)
                  setMelodyTrackIndex(null)
                } else {
                  setAutoMelodyTrack(false)
                  setMelodyTrackIndex(Number(value))
                }
              }}
              className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            >
              <option value="auto">Auto-detect (recommended)</option>
              {parsed.tracks
                .filter((t) => selectedTrackIndices.includes(t.index))
                .map((t) => (
                  <option key={t.index} value={t.index}>
                    {t.name}
                  </option>
                ))}
              <option value="none">No preference (pitch only)</option>
            </select>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-300">
              <input type="checkbox" checked={autoKey} onChange={(e) => setAutoKey(e.target.checked)} />
              Detect key automatically
            </label>
            {!autoKey && (
              <select
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              >
                {MAJOR_KEY_NAMES.map((name) => (
                  <option key={name} value={name}>
                    {name} Major
                  </option>
                ))}
              </select>
            )}
            <label className="mt-2 flex items-center gap-1.5 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={keySegmentation}
                onChange={(e) => setKeySegmentation(e.target.checked)}
              />
              Detect key changes (experimental)
            </label>
            <p className="mt-0.5 text-xs text-slate-500">
              Looks for a sustained, confident modulation partway through the song instead of
              forcing the whole piece through one key. Conservative by design — shouldn&apos;t
              fire on a typical chromatic-but-stable song, only a genuine, lasting key change.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">Artist</label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">Accompaniment</label>
            <p className="mt-0.5 text-xs text-slate-500">
              Fifteen keys can't hold a full piano texture — a chord under every melody note just
              competes with the tune for the same keys. The melody always plays in full; this
              controls how much goes underneath it.
            </p>
            <select
              value={accompaniment}
              onChange={(e) => setAccompaniment(e.target.value as AccompanimentMode)}
              className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            >
              {ACCOMPANIMENTS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label} — {a.hint}
                </option>
              ))}
            </select>
            <label className="mt-2 flex items-center gap-1.5 text-sm text-slate-300">
              Max chord notes
              <input
                type="number"
                min={1}
                max={6}
                value={maxChordNotes}
                onChange={(e) => setMaxChordNotes(Number(e.target.value))}
                className="w-14 rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 text-sm text-slate-100"
              />
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">Octave range handling</label>
            <select
              value={windowMode}
              onChange={(e) => setWindowMode(e.target.value as WindowMode)}
              className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            >
              <option value="adaptive">Adaptive — follow the melody, shift only between phrases</option>
              <option value="fixed">Fixed — one range for the whole song</option>
            </select>
            {windowMode === 'adaptive' && (
              <>
                <label className="mt-2 flex items-center gap-1.5 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={responsiveWindowing}
                    onChange={(e) => setResponsiveWindowing(e.target.checked)}
                  />
                  Responsive octave re-anchoring (experimental)
                </label>
                <p className="mt-0.5 text-xs text-slate-500">
                  Unproven — allows the range to also shift mid-phrase, not just between phrases,
                  for a melody that drifts far without ever pausing. This trades heavy note
                  folding for a possible audible register jump mid-line; A/B it by ear rather than
                  trusting the report numbers.
                </p>
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">Melody placement</label>
            <p className="mt-0.5 text-xs text-slate-500">
              Sky has no per-note volume — pitch is the only thing that reads as louder. &quot;High&quot;
              seats the melody near the top of its range so it sits above the accompaniment in the
              mix, instead of centered where it competes with it.
            </p>
            <select
              value={melodyPlacement}
              onChange={(e) => setMelodyPlacement(e.target.value as MelodyPlacement)}
              className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            >
              <option value="center">Center — original behavior</option>
              <option value="high">High — melody sits near the top of the range</option>
            </select>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm text-slate-300">
              <input type="checkbox" checked={sustainCapable} onChange={(e) => setSustainCapable(e.target.checked)} />
              Target instrument supports sustain (Triumph Violin, Cello, Harmonica, Electric
              Guitar, Voice of AURORA, Triumph Saxophone)
            </label>
            {sustainCapable && (
              <label className="mt-2 flex items-center gap-1.5 text-sm text-slate-300">
                Sustain threshold (ms)
                <input
                  type="number"
                  min={0}
                  value={sustainThresholdMs}
                  onChange={(e) => setSustainThresholdMs(Number(e.target.value))}
                  className="w-20 rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 text-sm text-slate-100"
                />
              </label>
            )}
          </div>

          <button
            onClick={() => void handleArrange()}
            disabled={arranging || selectedTrackIndices.length === 0}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {arranging ? 'Arranging…' : 'Arrange'}
          </button>
        </div>
      )}

      {song && report && (
        <div className="mt-6 space-y-3 rounded border border-slate-700 bg-slate-800/50 p-4">
          <h2 className="text-sm font-semibold text-slate-200">Arrangement report</h2>

          <div className="text-sm text-slate-300">
            Melody track:{' '}
            <span className="font-medium">
              {report.melodyTrackIndex === null
                ? 'None (pitch only)'
                : (parsed?.tracks.find((t) => t.index === report.melodyTrackIndex)?.name ??
                  `Track ${report.melodyTrackIndex + 1}`)}
            </span>
          </div>

          <div className="text-sm text-slate-300">
            Key: <span className="font-medium">{report.key} Major</span>{' '}
            <span className={report.keyFitPercent < 80 ? 'text-amber-400' : 'text-slate-400'}>
              ({report.keyFitPercent}% fit)
            </span>
            {report.keyFitPercent < 80 && (
              <p className="mt-1 text-xs text-amber-400">
                A lot of this song sits outside a single major scale, so many notes had to be
                snapped. Try picking the key manually if it sounds wrong.
              </p>
            )}
          </div>

          {report.keySegments && report.keySegments.length > 1 && (
            <div className="text-sm text-slate-300">
              <span className="font-medium">Detected key changes:</span>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-400">
                {report.keySegments.map((segment, i) => (
                  <li key={i}>
                    {formatMmSs(segment.startMs)}–{formatMmSs(segment.endMs)}: {segment.key} Major (
                    {segment.keyFitPercent}% fit)
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-slate-300">
            <li>Notes in: {report.notesIn}</li>
            <li>Notes out: {report.notesOut}</li>
            <li>Chord events: {report.chordEventsTotal}</li>
            <li>Avg notes/chord: {report.avgNotesPerChord}</li>
            <li>Peak notes/sec: {report.peakNotesPerSecond}</li>
            <li>Octave folds: {report.octaveFolds}</li>
            <li>Range shifts: {report.windowShifts}</li>
            <li>Doublings merged: {report.gridCollisionsMerged}</li>
            <li>Voicing-reduced: {report.voicingReduced}</li>
            <li>Dissonances avoided: {report.dissonancesAvoided}</li>
            <li>Accompaniment removed by mode: {report.densityThinned}</li>
            <li>Register-suppressed: {report.registerSuppressed}</li>
          </ul>

          <p className="text-xs text-slate-500">
            Tip: load this in Play Music Mode with dry-run enabled to preview the note stream
            before sending real keystrokes to the game.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save to library'}
            </button>
            <button
              onClick={() => void handleDevExport()}
              disabled={exportingDev}
              className="rounded bg-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-600 disabled:opacity-50"
            >
              {exportingDev ? 'Exporting…' : 'Export raw + arranged (dev)'}
            </button>
          </div>

          {savedPath && <p className="text-sm text-emerald-400">Saved to {savedPath}</p>}
          {devExportPaths && (
            <p className="text-xs text-slate-500">
              Exported {devExportPaths.raw} and {devExportPaths.arranged}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
