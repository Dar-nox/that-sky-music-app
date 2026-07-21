import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  DEFAULT_ARRANGE_OPTIONS,
  type AccompanimentMode,
  type ArrangeOptions,
  type DensityMode,
  type RhythmGrid,
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

const RHYTHM_GRIDS: { value: RhythmGrid; label: string }[] = [
  { value: 'off', label: 'Off — keep original timing' },
  { value: '1/8', label: '1/8 notes — strongest tightening' },
  { value: '1/16', label: '1/16 notes — recommended' },
  { value: '1/32', label: '1/32 notes — light touch-up' }
]

const ACCOMPANIMENTS: { value: AccompanimentMode; label: string; hint: string }[] = [
  { value: 'harmony', label: 'On harmony changes', hint: 'Chords land only when the harmony moves — recommended' },
  { value: 'full', label: 'Full', hint: 'A voicing under every melody note; densest, muddiest' },
  { value: 'bass', label: 'Bass only', hint: 'Just the bass line under the melody' },
  { value: 'none', label: 'None', hint: 'Melody alone — the cleanest, most reliable result' }
]

const DENSITIES: { value: DensityMode; label: string }[] = [
  { value: 'sparse', label: 'Sparse' },
  { value: 'medium', label: 'Medium' },
  { value: 'full', label: 'Full' }
]

export function ArrangerMode() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null)
  const [parsed, setParsed] = useState<ParsedMidi | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [selectedTrackIndices, setSelectedTrackIndices] = useState<number[]>([0])
  const [autoKey, setAutoKey] = useState(DEFAULT_ARRANGE_OPTIONS.autoKey)
  const [key, setKey] = useState('C')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [sustainCapable, setSustainCapable] = useState(false)
  const [sustainThresholdMs, setSustainThresholdMs] = useState(DEFAULT_SETTINGS.sustainThresholdMs)
  const [maxChordNotes, setMaxChordNotes] = useState(DEFAULT_ARRANGE_OPTIONS.maxChordNotes)
  const [rhythmGrid, setRhythmGrid] = useState<RhythmGrid>(DEFAULT_ARRANGE_OPTIONS.rhythmGrid)
  const [density, setDensity] = useState<DensityMode>(DEFAULT_ARRANGE_OPTIONS.density)
  const [accompaniment, setAccompaniment] = useState<AccompanimentMode>(
    DEFAULT_ARRANGE_OPTIONS.accompaniment
  )
  const [windowMode, setWindowMode] = useState<WindowMode>(DEFAULT_ARRANGE_OPTIONS.windowMode)

  const [arranging, setArranging] = useState(false)
  const [song, setSong] = useState<Song | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedPath, setSavedPath] = useState<string | null>(null)

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
    setSelectedTrackIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b)
    )
  }

  async function handleArrange(): Promise<void> {
    if (!buffer || !parsed || selectedTrackIndices.length === 0) return

    setArranging(true)
    setError(null)
    setSong(null)
    setSavedPath(null)

    const options: ArrangeOptions = {
      trackIndices: selectedTrackIndices,
      key,
      autoKey,
      sustainCapable,
      sustainThresholdMs,
      maxChordNotes,
      rhythmGrid,
      onsetMergeMs: DEFAULT_ARRANGE_OPTIONS.onsetMergeMs,
      minRetriggerMs: DEFAULT_ARRANGE_OPTIONS.minRetriggerMs,
      density,
      accompaniment,
      windowMode,
      sourceFileName: fileName ?? 'unknown.mid',
      title: title || 'Untitled',
      artist
    }

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

  const report = song?.meta.arrangement

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold text-slate-100">Sky Music Arranger</h1>
      <p className="mt-2 text-sm text-slate-400">
        Where Convert Mode transcribes a MIDI note-for-note, the Arranger reshapes it to suit a
        15-key diatonic instrument: it anchors the playable octave range on the melody, folds the
        accompaniment around it, reduces chords to the notes that actually carry the harmony,
        tightens rhythm and thins density. Always full chords.
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
            <label className="block text-sm font-medium text-slate-300">Rhythm snap</label>
            <p className="mt-0.5 text-xs text-slate-500">
              Pulls onsets onto the beat and turns rolled chords into blocks. Turn off for
              free-time or heavily rubato pieces.
            </p>
            <select
              value={rhythmGrid}
              onChange={(e) => setRhythmGrid(e.target.value as RhythmGrid)}
              className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            >
              {RHYTHM_GRIDS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
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
          </div>

          <div>
            <span className="block text-sm font-medium text-slate-300">Density</span>
            <p className="mt-0.5 text-xs text-slate-500">
              Caps how often the accompaniment re-strikes. Never affects the melody — drop to
              Sparse if an arrangement still sounds cluttered.
            </p>
            <div className="mt-1 flex gap-4 text-sm text-slate-300">
              {DENSITIES.map((d) => (
                <label key={d.value} className="flex items-center gap-1.5">
                  <input type="radio" checked={density === d.value} onChange={() => setDensity(d.value)} />
                  {d.label}
                </label>
              ))}
              <label className="flex items-center gap-1.5">
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
            <li>Density-thinned: {report.densityThinned}</li>
            <li>Register-suppressed: {report.registerSuppressed}</li>
            <li>Blocked by melody: {report.melodyProtected}</li>
            <li>Onsets snapped: {report.onsetsSnapped}</li>
            <li>Onsets merged: {report.onsetsMerged}</li>
            <li>Retriggers removed: {report.retriggersRemoved}</li>
          </ul>

          <p className="text-xs text-slate-500">
            Tip: load this in Play Music Mode with dry-run enabled to preview the note stream
            before sending real keystrokes to the game.
          </p>

          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save to library'}
          </button>

          {savedPath && <p className="text-sm text-emerald-400">Saved to {savedPath}</p>}
        </div>
      )}
    </div>
  )
}
