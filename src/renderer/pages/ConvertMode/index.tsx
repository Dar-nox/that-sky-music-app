import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  MAJOR_KEY_NAMES,
  majorRootPcToKeyName,
  parseKeyToMajorRootPc,
  type ChordMode,
  type ConvertOptions,
  type OutOfRangeMode,
  type ParsedMidi
} from '@shared/midi'
import type { Song } from '@shared/song'
import { DEFAULT_SETTINGS } from '@shared/settings'

function normalizeToMajorKeyName(key: string): string {
  try {
    return majorRootPcToKeyName(parseKeyToMajorRootPc(key))
  } catch {
    return 'C'
  }
}

export function ConvertMode() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null)
  const [parsed, setParsed] = useState<ParsedMidi | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [selectedTrackIndices, setSelectedTrackIndices] = useState<number[]>([0])
  const [key, setKey] = useState('C')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [sustainCapable, setSustainCapable] = useState(false)
  const [sustainThresholdMs, setSustainThresholdMs] = useState(DEFAULT_SETTINGS.sustainThresholdMs)
  const [chordMode, setChordMode] = useState<ChordMode>('melody')
  const [maxChordNotes, setMaxChordNotes] = useState(4)
  const [outOfRangeMode, setOutOfRangeMode] = useState<OutOfRangeMode>('shift')
  const [dropAccidentals, setDropAccidentals] = useState(false)

  const [converting, setConverting] = useState(false)
  const [song, setSong] = useState<Song | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedPath, setSavedPath] = useState<string | null>(null)
  const [exportingDev, setExportingDev] = useState(false)
  const [devExportPaths, setDevExportPaths] = useState<{ raw: string; converted: string } | null>(null)

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
      setSelectedTrackIndices([result.suggestedTrackIndex])
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

  async function handleConvert(): Promise<void> {
    if (!buffer || !parsed || selectedTrackIndices.length === 0) return

    setConverting(true)
    setError(null)
    setSong(null)
    setSavedPath(null)
    setDevExportPaths(null)

    const options: ConvertOptions = {
      trackIndices: selectedTrackIndices,
      key,
      sustainCapable,
      sustainThresholdMs,
      chordMode,
      maxChordNotes,
      outOfRangeMode,
      dropAccidentals,
      sourceFileName: fileName ?? 'unknown.mid',
      title: title || 'Untitled',
      artist
    }

    try {
      const result = await window.skyAPI.convertMidi(buffer, options)
      setSong(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed')
    } finally {
      setConverting(false)
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
   * Dev-only: writes the unaltered MIDI parse and this conversion side by side into dev-exports/,
   * for manually comparing against the Arranger's output on the same source file.
   */
  async function handleDevExport(): Promise<void> {
    if (!buffer || !song) return

    setExportingDev(true)
    setError(null)

    try {
      const baseName = fileName ?? 'unknown.mid'
      const [raw, converted] = await Promise.all([
        window.skyAPI.devExportRawMidi(buffer, baseName),
        window.skyAPI.devExportJson(song, baseName, 'converted')
      ])
      setDevExportPaths({ raw, converted })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dev export failed')
    } finally {
      setExportingDev(false)
    }
  }

  const report = song?.meta.conversionReport
  const pct = (n: number): string => (report && report.notesTotal > 0 ? `${Math.round((n / report.notesTotal) * 100)}%` : '0%')

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold text-slate-100">Convert Mode</h1>
      <p className="mt-2 text-sm text-slate-400">
        Import a MIDI file and convert it into a Sky note sheet. Notes are quantized to the
        nearest diatonic scale degree, then mapped to the 15-key grid — the melody stays
        internally correct even if Sky auto-transposes the instrument in-game.
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
            <label className="block text-sm font-medium text-slate-300">Tracks to convert</label>
            <p className="mt-0.5 text-xs text-slate-500">
              Select more than one to combine them (e.g. a piano file's separate treble/bass-clef
              tracks) into a single note stream — pair with "Full chords" below for the best result.
            </p>
            <div className="mt-1 space-y-1 rounded border border-slate-600 bg-slate-900 p-2">
              {parsed.tracks.map((t) => (
                <label key={t.index} className="flex items-center gap-1.5 text-sm text-slate-100">
                  <input
                    type="checkbox"
                    checked={selectedTrackIndices.includes(t.index)}
                    onChange={() => toggleTrack(t.index)}
                  />
                  {t.name} ({t.noteCount} notes){t.index === parsed.suggestedTrackIndex ? ' — suggested' : ''}
                </label>
              ))}
            </div>
            {selectedTrackIndices.length === 0 && (
              <p className="mt-1 text-xs text-red-400">Select at least one track.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">
              Key {parsed.detectedKey ? '(from file, editable)' : '(estimated, editable)'}
            </label>
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
            <span className="block text-sm font-medium text-slate-300">Chord density</span>
            <div className="mt-1 flex gap-4 text-sm text-slate-300">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={chordMode === 'melody'}
                  onChange={() => setChordMode('melody')}
                />
                Melody only
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={chordMode === 'chords'}
                  onChange={() => setChordMode('chords')}
                />
                Full chords
              </label>
              {chordMode === 'chords' && (
                <label className="flex items-center gap-1.5">
                  Max notes
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={maxChordNotes}
                    onChange={(e) => setMaxChordNotes(Number(e.target.value))}
                    className="w-14 rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 text-sm text-slate-100"
                  />
                </label>
              )}
            </div>
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

          <div>
            <label className="block text-sm font-medium text-slate-300">Notes outside the 2-octave grid</label>
            <select
              value={outOfRangeMode}
              onChange={(e) => setOutOfRangeMode(e.target.value as OutOfRangeMode)}
              className="mt-1 w-full rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            >
              <option value="shift">Shift by octaves to fit</option>
              <option value="clamp">Clamp to nearest edge note</option>
              <option value="drop">Drop the note</option>
            </select>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={dropAccidentals}
                onChange={(e) => setDropAccidentals(e.target.checked)}
              />
              Drop accidentals
            </label>
            <p className="mt-0.5 text-xs text-slate-500">
              Removes notes that aren&apos;t already on the diatonic scale instead of snapping
              them to the nearest scale degree. Independent of the range setting above — this is
              about pitch, not register.
            </p>
          </div>

          <button
            onClick={() => void handleConvert()}
            disabled={converting || selectedTrackIndices.length === 0}
            className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {converting ? 'Converting…' : 'Convert'}
          </button>
        </div>
      )}

      {song && report && (
        <div className="mt-6 space-y-3 rounded border border-slate-700 bg-slate-800/50 p-4">
          <h2 className="text-sm font-semibold text-slate-200">Conversion report</h2>
          <ul className="space-y-1 text-sm text-slate-300">
            <li>
              Unaltered: {report.notesUnaltered} ({pct(report.notesUnaltered)})
            </li>
            <li>
              Octave-shifted: {report.notesOctaveShifted} ({pct(report.notesOctaveShifted)})
            </li>
            <li>
              Dropped: {report.notesDropped} ({pct(report.notesDropped)})
            </li>
            <li className="text-slate-400">Total: {report.notesTotal}</li>
          </ul>

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
              {exportingDev ? 'Exporting…' : 'Export raw + converted (dev)'}
            </button>
          </div>

          {savedPath && <p className="text-sm text-emerald-400">Saved to {savedPath}</p>}
          {devExportPaths && (
            <p className="text-xs text-slate-500">
              Exported {devExportPaths.raw} and {devExportPaths.converted}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
