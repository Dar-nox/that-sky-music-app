import { useEffect, useState } from 'react'
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
import { MidiWorkbench, OptionGroup, TrackList } from '../../components/midi/MidiWorkbench'
import {
  Alert,
  Annotation,
  Button,
  Checkbox,
  Field,
  Figure,
  NumberInput,
  PaintedBar,
  RadioGroup,
  Select,
  TextInput
} from '../../components/ui'
import { IconSave } from '../../components/icons'

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

  async function handleFiles(files: File[]): Promise<void> {
    const file = files[0]
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
    <MidiWorkbench
      title="Convert Mode"
      intro="Import a MIDI file and convert it into a Sky note sheet. Notes are quantized to the nearest diatonic scale degree, then mapped to the 15-key grid — the melody stays internally correct even if Sky auto-transposes the instrument in-game."
      fileName={fileName}
      fileBadges={
        parsed ? (
          <>
            <Annotation>{parsed.tracks.length} tracks</Annotation>
            <Annotation tone="gold">{key} Major</Annotation>
          </>
        ) : undefined
      }
      onFiles={handleFiles}
      error={error}
      actionLabel="Convert"
      actionBusyLabel="Converting…"
      actionBusy={converting}
      actionDisabled={converting || selectedTrackIndices.length === 0}
      actionWarning={selectedTrackIndices.length === 0 ? 'Select at least one track.' : null}
      onAction={() => void handleConvert()}
      optionsSlot={
        parsed && (
          <div className="grid gap-x-14 gap-y-10 xl:grid-cols-2">
            <OptionGroup label="Notes">
              <Field
                label="Tracks to convert"
                hint={
                  'Select more than one to combine them (e.g. a piano file\u2019s separate treble/bass-clef tracks) into a single note stream — pair with "Full chords" for the best result.'
                }
              >
                <TrackList>
                  {parsed.tracks.map((t) => (
                    <Checkbox
                      key={t.index}
                      checked={selectedTrackIndices.includes(t.index)}
                      onCheckedChange={() => toggleTrack(t.index)}
                      label={
                        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="min-w-0 truncate">{t.name}</span>
                          <Annotation>{t.noteCount} notes</Annotation>
                          {t.index === parsed.suggestedTrackIndex && (
                            <Annotation tone="gold">suggested</Annotation>
                          )}
                        </span>
                      }
                    />
                  ))}
                </TrackList>
              </Field>

              <Field label={`Key ${parsed.detectedKey ? '(from file, editable)' : '(estimated, editable)'}`}>
                <Select value={key} onChange={(e) => setKey(e.target.value)}>
                  {MAJOR_KEY_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {name} Major
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Notes outside the 2-octave grid">
                <Select
                  value={outOfRangeMode}
                  onChange={(e) => setOutOfRangeMode(e.target.value as OutOfRangeMode)}
                >
                  <option value="shift">Shift by octaves to fit</option>
                  <option value="clamp">Clamp to nearest edge note</option>
                  <option value="drop">Drop the note</option>
                </Select>
              </Field>

              <Checkbox
                checked={dropAccidentals}
                onCheckedChange={setDropAccidentals}
                label="Drop accidentals"
                hint="Removes notes that aren’t already on the diatonic scale instead of snapping them to the nearest scale degree. Independent of the range setting above — this is about pitch, not register."
              />
            </OptionGroup>

            <OptionGroup label="Performance">
              <Field label="Chord density">
                <div className="flex flex-wrap items-center gap-3">
                  <RadioGroup
                    name="convert-chord-mode"
                    value={chordMode}
                    onChange={setChordMode}
                    options={[
                      { value: 'melody', label: 'Melody only' },
                      { value: 'chords', label: 'Full chords' }
                    ]}
                  />
                  {chordMode === 'chords' && (
                    <label className="flex items-center gap-2 text-sm text-moon-200">
                      Max notes
                      <NumberInput
                        width="xs"
                        min={1}
                        max={5}
                        value={maxChordNotes}
                        onChange={(e) => setMaxChordNotes(Number(e.target.value))}
                      />
                    </label>
                  )}
                </div>
              </Field>

              <Checkbox
                checked={sustainCapable}
                onCheckedChange={setSustainCapable}
                label="Target instrument supports sustain"
                hint="Triumph Violin, Cello, Harmonica, Electric Guitar, Voice of AURORA, Triumph Saxophone."
              />
              {sustainCapable && (
                <label className="flex items-center gap-2 text-sm text-moon-200">
                  Sustain threshold (ms)
                  <NumberInput
                    width="xs"
                    min={0}
                    value={sustainThresholdMs}
                    onChange={(e) => setSustainThresholdMs(Number(e.target.value))}
                  />
                </label>
              )}

              <div className="grid grid-cols-2 gap-6 pt-1">
                <Field label="Title">
                  <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
                </Field>
                <Field label="Artist">
                  <TextInput value={artist} onChange={(e) => setArtist(e.target.value)} />
                </Field>
              </div>
            </OptionGroup>
          </div>
        )
      }
      reportSlot={
        song && report ? (
          <div className="space-y-9">
            {/* The headline number leads; the proportions sit beside it. Four
                equal bordered tiles gave a total the same weight as a rounding
                error, which is not how you read a conversion. */}
            <div className="flex flex-wrap items-end gap-x-14 gap-y-7">
              <div className="shrink-0">
                <div className="font-display text-6xl leading-none font-semibold text-moon-50">
                  {report.notesTotal}
                </div>
                <div className="mt-2.5 text-sm text-moon-400">notes in the sheet</div>
              </div>
              <div className="min-w-[16rem] flex-1">
                <PaintedBar
                  segments={[
                    { label: 'Unaltered', value: report.notesUnaltered, tone: 'gold' },
                    { label: 'Octave-shifted', value: report.notesOctaveShifted, tone: 'neutral' },
                    { label: 'Dropped', value: report.notesDropped, tone: 'bad' }
                  ]}
                />
              </div>
            </div>

            <div className="hairline-top grid grid-cols-3 gap-8 pt-7">
              <Figure
                tone="gold"
                value={pct(report.notesUnaltered)}
                label="Unaltered"
                sub={`${report.notesUnaltered} notes`}
              />
              <Figure
                value={pct(report.notesOctaveShifted)}
                label="Octave-shifted"
                sub={`${report.notesOctaveShifted} notes`}
              />
              <Figure
                tone={report.notesDropped > 0 ? 'bad' : 'neutral'}
                value={pct(report.notesDropped)}
                label="Dropped"
                sub={`${report.notesDropped} notes`}
              />
            </div>

            <div className="flex flex-wrap items-center gap-7 pt-1">
              <Button
                variant="success"
                icon={<IconSave size={15} />}
                loading={saving}
                onClick={() => void handleSave()}
              >
                {saving ? 'Saving…' : 'Save to library'}
              </Button>
              <Button loading={exportingDev} onClick={() => void handleDevExport()}>
                {exportingDev ? 'Exporting…' : 'Export raw + converted (dev)'}
              </Button>
            </div>

            {savedPath && <Alert tone="success">Saved to {savedPath}</Alert>}
            {devExportPaths && (
              <p className="font-mono text-[11px] break-all text-moon-500">
                Exported {devExportPaths.raw} and {devExportPaths.converted}
              </p>
            )}
          </div>
        ) : undefined
      }
    />
  )
}

